import { NextResponse } from "next/server"
import { planRequestSchema, planResponseSchema } from "@/lib/plan-schema"
import { buildPlanSystemPrompt } from "@/lib/ai-plan-system-prompt"
import {
  getProviderUnavailableReason,
  resolveAiProviderForRequest,
  type AiProviderId,
} from "@/lib/ai-provider"
import { inferThemeId } from "@/lib/theme/theme-infer"
import type { ThemeId } from "@/lib/theme/theme-types"
import { vertexClaudeRawPredict } from "@/lib/vertex-claude"
import { vertexGeminiGenerateJson } from "@/lib/vertex-gemini"
import { callOpenAiJsonObject } from "@/lib/openai-codegen"
import { parseModelJsonObject } from "@/lib/parse-model-json"
import { requireBuildAiUserIdFromRequest } from "@/lib/auth/buildai-supabase-admin"
import {
  applyFreeFirstBuildCap,
  canUseFreeFirstBuildWaiver,
  currentMonthKeyUtc,
  getUserCreditBalanceUsd,
  insertCreditsLedgerEntriesSplit,
  insertUsageEvent,
  maybeGrantFreeMonthlyCredits,
} from "@/lib/service/credits"
import { estimatePreauthChargeUsd, estimateUsageAndCharge } from "@/lib/service/usage-meter"

function buildUserDelimitedContent(content: string): string {
  return `User message (delimited):\n<<<USER>>>\n${content}\n<<<END>>>`
}

export async function POST(req: Request) {
  try {
    const userId = await requireBuildAiUserIdFromRequest(req)
    await maybeGrantFreeMonthlyCredits(userId)
    const json: unknown = await req.json()
    const body = planRequestSchema.parse(json)
    const supabaseConfigured = body.flags?.supabaseConfigured === true
    const uiStyleKit = body.flags?.uiStyleKit
    const themeId = (body.flags?.themeId ?? "auto") as ThemeId
    const provider: AiProviderId = resolveAiProviderForRequest(body.flags?.aiProvider)
    const explicitReason =
      body.flags?.aiProvider &&
      body.flags.aiProvider !== "auto"
        ? getProviderUnavailableReason(body.flags.aiProvider)
        : null
    if (explicitReason) {
      return NextResponse.json({ error: explicitReason }, { status: 503 })
    }

    const lastUser = [...body.messages].reverse().find((m) => m.role === "user")?.content ?? ""
    const clarificationsBlock =
      body.clarifications?.length
        ? `\n\n## USER ANSWERS (mandatory — incorporate into the plan)\n${body.clarifications
            .map((c) => `- ${c.questionId}: ${c.answer}`)
            .join("\n")}\n\nRules:\n- Incorporate USER ANSWERS into plan.summary, assumptions, views, buildTodos, and designNotes as needed.\n- After incorporating, minimize plan.openQuestions; if the answers fully resolve the gaps, set openQuestions to [].\n`
        : ""

    const systemJsonHint =
      "Return **only** one JSON object with keys reply and plan. No markdown fences, no text before or after the JSON. Do not include appTsx or code."
    const langHint =
      body.flags?.uiLang === "zh-HK"
        ? "Important: Output MUST be Traditional Chinese (Hong Kong). This includes reply, plan.summary, assumptions, openQuestions.question, suggestedAnswers, options labels, buildTodos, and designNotes."
        : "Important: Output MUST be English."

    // Pre-auth: block if balance is clearly insufficient (conservative estimate).
    const bal = await getUserCreditBalanceUsd(userId)
    const preauth = estimatePreauthChargeUsd({
      aiProviderChoice: body.flags?.aiProvider,
      inputText: `${langHint}\n\n${systemJsonHint}\n\n${lastUser}`,
      assumedOutputTokens: 1000,
      markupMin: 5,
    })
    // Don’t block too aggressively: pre-auth is just a safety check.
    const minRequired = 1
    const firstBuild = await canUseFreeFirstBuildWaiver(userId)
    if (bal.balanceUsd < Math.min(preauth, minRequired) && !firstBuild) {
      return NextResponse.json(
        { error: "Insufficient credits", code: "INSUFFICIENT_CREDITS", neededUsd: preauth, balanceUsd: bal.balanceUsd },
        { status: 402 },
      )
    }

    const inferred = themeId === "auto" ? inferThemeId({ userPrompt: lastUser, visualThemeKeywords: null }) : themeId
    const themeHint =
      inferred === "natural_light"
        ? "natural, calm, light palette (warm neutrals + soft greens)"
        : inferred === "neon_dark"
          ? "high-contrast dark palette with neon accents (emerald/cyan)"
          : inferred === "minimal_light"
            ? "minimal light palette (white background, subtle borders)"
            : "studio-dark modern palette (dark surfaces + crisp hierarchy)"

    const brandMood = inferBrandMood(lastUser)

    const baseSystem = buildPlanSystemPrompt({
      supabaseConfigured,
      ...(uiStyleKit ? { uiStyleKit } : {}),
    })
    const baseSystemWithTheme = `${baseSystem}\n\nTheme hint (use in visualThemeKeywords + designNotes): ${themeHint}\nBrand mood hint (reflect in designNotes + demo copy tone): ${brandMood}${clarificationsBlock}`

    const system =
      provider === "vertex_claude" || provider === "vertex_gemini"
        ? `${baseSystemWithTheme}\n\n${langHint}\n\n${systemJsonHint}`
        : `${baseSystemWithTheme}\n\n${langHint}\n\n${systemJsonHint}`

    let parsed: unknown

    if (provider === "vertex_claude") {
      const anthropicMessages = body.messages.map((m) => ({
        role: m.role as "user" | "assistant",
        content:
          m.role === "user" ? buildUserDelimitedContent(m.content) : m.content,
      }))

      const run = async () => {
        const text = await vertexClaudeRawPredict({
          system,
          messages: anthropicMessages,
        })
        return parseModelJsonObject(text)
      }
      try {
        parsed = await run()
      } catch {
        parsed = await run()
      }
    } else if (provider === "vertex_gemini") {
      const geminiMessages = body.messages.map((m) => ({
        role: m.role as "user" | "assistant",
        content:
          m.role === "user" ? buildUserDelimitedContent(m.content) : m.content,
      }))

      const run = async () => {
        const text = await vertexGeminiGenerateJson({
          system,
          messages: geminiMessages,
        })
        return parseModelJsonObject(text)
      }
      try {
        parsed = await run()
      } catch {
        parsed = await run()
      }
    } else {
      const chatMessages = [
        { role: "system", content: system },
        ...body.messages.map((m) => ({
          role: m.role,
          content:
            m.role === "user" ? buildUserDelimitedContent(m.content) : m.content,
        })),
      ]
      try {
        parsed = await callOpenAiJsonObject(chatMessages)
      } catch {
        parsed = await callOpenAiJsonObject(chatMessages)
      }
    }

    const normalized = planResponseSchema.parse(parsed)

    // Meter + charge (rough estimate from texts).
    const usage = estimateUsageAndCharge({
      aiProviderChoice: body.flags?.aiProvider,
      inputText: `${system}\n\n${body.messages.map((m) => `${m.role}: ${m.content}`).join("\n")}`,
      outputText: JSON.stringify(normalized),
      markupMin: 5,
      modelLabel: provider,
    })
    await insertUsageEvent({
      userId,
      provider: usage.provider,
      model: usage.model,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      costUsd: usage.costUsd,
      chargedUsd: usage.chargedUsd,
      meta: { kind: "plan" },
    })
    const capped = firstBuild
      ? await applyFreeFirstBuildCap({ userId, phase: "plan", chargedUsd: usage.chargedUsd, capUsd: 3 })
      : { finalChargedUsd: usage.chargedUsd, discountUsd: 0 }
    await insertCreditsLedgerEntriesSplit({
      userId,
      kind: "usage_charge",
      totalChargeUsd: capped.finalChargedUsd,
      splitUsd: 1,
      meta: firstBuild
        ? { kind: "first_build", month: currentMonthKeyUtc(), phase: "plan", provider: usage.provider, model: usage.model }
        : { kind: "plan", provider: usage.provider, model: usage.model },
    })

    return NextResponse.json(normalized)
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error"
    const isConfig =
      message.includes("Missing OPENAI_API_KEY") ||
      message.includes("Could not determine GCP project id") ||
      message.includes("Failed to obtain Google Cloud access token") ||
      message.includes("Vertex Claude request failed") ||
      message.includes("Vertex Gemini request failed") ||
      message.includes("Vertex Gemini blocked") ||
      message.includes("Vertex Gemini finish reason") ||
      message.includes("Gemini API (API key) failed") ||
      message.includes("after retries / model fallbacks") ||
      message.includes("Gemini API blocked") ||
      message.includes("Gemini API finish reason") ||
      message.includes("No Gemini auth configured") ||
      message.includes("AI request failed")
    const status = message.toLowerCase().includes("unauthorized") ? 401 : isConfig ? 503 : 400
    return NextResponse.json({ error: message }, { status })
  }
}

function inferBrandMood(text: string): string {
  const hay = text.toLowerCase()
  if (/(incense|aroma|aromatherapy|essential oil|diffuser|spa|wellness|mindful|botanical|lavender|sage|natural)/i.test(hay)) {
    return "calm, natural, gentle"
  }
  if (/(pokemon|pokémon|tcg|trading card|collectible|booster|deck|tournament|arcade)/i.test(hay)) {
    return "playful, energetic, bold"
  }
  if (/(luxury|premium|jewelry|watch|perfume|high-end|boutique|exclusive)/i.test(hay)) {
    return "premium, minimal, refined"
  }
  if (/(kids|children|family|cute|pastel)/i.test(hay)) {
    return "friendly, playful, approachable"
  }
  return "modern, clear, trustworthy"
}
