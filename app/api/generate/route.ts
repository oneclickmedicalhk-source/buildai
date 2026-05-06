import { NextResponse } from "next/server"
import { z } from "zod"
import {
  type GenerateRequest,
  generateRequestSchema,
  generateResponseSchema,
} from "@/lib/ai-generate-schema"
import { buildCodegenSystemPrompt } from "@/lib/ai-system-prompt"
import { filterModelFiles } from "@/lib/sandpack-tailwind-template"
import {
  getProviderUnavailableReason,
  resolveAiProviderForRequest,
  type AiProviderId,
} from "@/lib/ai-provider"
import { inferThemeId, inferThemeVariantId } from "@/lib/theme/theme-infer"
import { resolveThemeTokens, type ThemeId, type ThemeVariantId } from "@/lib/theme/theme-types"
import { vertexClaudeRawPredict } from "@/lib/vertex-claude"
import { vertexGeminiGenerateJson } from "@/lib/vertex-gemini"
import { callOpenAiJsonObject } from "@/lib/openai-codegen"
import { parseModelJsonObject } from "@/lib/parse-model-json"
import { applyUnifiedDiffToVirtualFiles } from "@/lib/patch/apply-unified-diff"
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

const modelOutputSchema = z.object({
  reply: z.string(),
  appTsx: z.string(),
  extraFiles: z.record(z.string()).optional(),
})

const modelPatchOutputSchema = z.object({
  reply: z.string(),
  /**
   * Unified diffs keyed by virtual path.
   * Example key: "/App.tsx", "/components/Hero.tsx"
   */
  patches: z.record(z.string()),
})

function buildUserDelimitedContent(content: string): string {
  return `User message (delimited):\n<<<USER>>>\n${content}\n<<<END>>>`
}

const MAX_REFINE_JSON_CHARS = 180_000

function buildOutboundMessages(body: GenerateRequest): {
  role: "user" | "assistant"
  content: string
}[] {
  if (!body.refineFrom) return body.messages
  const packObj = {
    appTsx: body.refineFrom.appTsx,
    extraFiles: body.refineFrom.extraFiles ?? {},
  }
  let json = JSON.stringify(packObj)
  if (json.length > MAX_REFINE_JSON_CHARS) {
    json = JSON.stringify({
      appTsx: body.refineFrom.appTsx.slice(0, 120_000),
      extraFiles: {},
    })
  }
  const lastUser = [...body.messages].reverse().find((m) => m.role === "user")
  const instruction =
    lastUser?.content?.trim() ||
    "Polish this UI: improve spacing, responsive breakpoints, typography, and accessibility. Preserve all behavior."
  return [
    {
      role: "user",
      content: `${instruction}\n\n<<<EXISTING_CODE_JSON>>>\n${json}\n<<<END>>>`,
    },
  ]
}

export async function POST(req: Request) {
  try {
    const userId = await requireBuildAiUserIdFromRequest(req)
    await maybeGrantFreeMonthlyCredits(userId)
    const json: unknown = await req.json()
    const body = generateRequestSchema.parse(json)
    const supabaseConfigured = body.flags?.supabaseConfigured === true
    const uiStyleKit = body.flags?.uiStyleKit
    const themeId = (body.flags?.themeId ?? "auto") as ThemeId
    const themeVariantId = (body.flags?.themeVariantId ?? "auto") as ThemeVariantId
    const provider: AiProviderId = resolveAiProviderForRequest(body.flags?.aiProvider)
    const explicitReason =
      body.flags?.aiProvider &&
      body.flags.aiProvider !== "auto"
        ? getProviderUnavailableReason(body.flags.aiProvider)
        : null
    if (explicitReason) {
      return NextResponse.json({ error: explicitReason }, { status: 503 })
    }

    const outboundMessages = buildOutboundMessages(body)
    const lastUser = [...outboundMessages].reverse().find((m) => m.role === "user")?.content ?? ""

    const patchMode =
      body.refineFrom != null &&
      (body.refineKind ?? "polish") === "edit" &&
      (body.editOutput ?? "auto") === "patch"

    // Pre-auth: conservative estimate. Generate is more expensive than plan.
    const bal = await getUserCreditBalanceUsd(userId)
    const preauth = estimatePreauthChargeUsd({
      aiProviderChoice: body.flags?.aiProvider,
      inputText: `${lastUser}`,
      assumedOutputTokens: 2200,
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
    const inferred =
      themeId === "auto"
        ? inferThemeId({
            userPrompt: lastUser,
            visualThemeKeywords: body.approvedPlan?.visualThemeKeywords ?? null,
          })
        : themeId
    const inferredVariant =
      themeVariantId === "auto"
        ? inferThemeVariantId({
            themeId: inferred,
            userPrompt: lastUser,
            visualThemeKeywords: body.approvedPlan?.visualThemeKeywords ?? null,
          })
        : themeVariantId
    const themeTokens = resolveThemeTokens({ themeId: inferred, variantId: inferredVariant })

    const baseSystem = buildCodegenSystemPrompt({
      supabaseConfigured,
      approvedPlan: body.approvedPlan,
      clarifications: body.clarifications,
      polishExistingCode: Boolean(body.refineFrom),
      ...(body.refineFrom ? { refineKind: body.refineKind ?? "polish" } : {}),
      ...(patchMode ? { patchOutput: true } : {}),
      ...(uiStyleKit ? { uiStyleKit } : {}),
      ...(themeTokens ? { themeTokens } : {}),
    })

    const systemJsonHint = patchMode
      ? [
          "Return **only** one JSON object with keys reply and patches (map of virtual path to unified diff).",
          "No markdown fences, no text before or after the JSON.",
          "PATCH RULES:",
          "- Only output diffs for files that actually changed.",
          "- Use unified diff format with --- and +++ headers and @@ hunks.",
          "- Paths must be virtual and start with / (e.g. /App.tsx, /components/Hero.tsx).",
          "- If you need to add a new file, use --- /dev/null and +++ /path.",
          "- Do NOT include appTsx/extraFiles in patch mode.",
        ].join("\n")
      : "Return **only** one JSON object with keys reply, appTsx, and optional extraFiles. No markdown fences, no text before or after the JSON."

    const system =
      provider === "vertex_claude"
        ? `${baseSystem}\n\n${systemJsonHint}`
        : provider === "vertex_gemini"
          ? `${baseSystem}\n\n${systemJsonHint}`
          : baseSystem

    let parsed: z.infer<typeof modelOutputSchema> | z.infer<typeof modelPatchOutputSchema>

    if (provider === "vertex_claude") {
      const anthropicMessages = outboundMessages.map((m) => ({
        role: m.role as "user" | "assistant",
        content:
          m.role === "user" ? buildUserDelimitedContent(m.content) : m.content,
      }))

      const run = async () => {
        const text = await vertexClaudeRawPredict({
          system,
          messages: anthropicMessages,
        })
        const obj = parseModelJsonObject(text)
        return patchMode ? modelPatchOutputSchema.parse(obj) : modelOutputSchema.parse(obj)
      }
      try {
        parsed = await run()
      } catch {
        parsed = await run()
      }
    } else if (provider === "vertex_gemini") {
      const geminiMessages = outboundMessages.map((m) => ({
        role: m.role as "user" | "assistant",
        content:
          m.role === "user" ? buildUserDelimitedContent(m.content) : m.content,
      }))

      const run = async () => {
        const text = await vertexGeminiGenerateJson({
          system,
          messages: geminiMessages,
        })
        const obj = parseModelJsonObject(text)
        return patchMode ? modelPatchOutputSchema.parse(obj) : modelOutputSchema.parse(obj)
      }
      try {
        parsed = await run()
      } catch {
        parsed = await run()
      }
    } else {
      const chatMessages = [
        { role: "system", content: system },
        ...outboundMessages.map((m) => ({
          role: m.role,
          content:
            m.role === "user" ? buildUserDelimitedContent(m.content) : m.content,
        })),
      ]
      try {
        const first = await callOpenAiJsonObject(chatMessages)
        parsed = patchMode ? modelPatchOutputSchema.parse(first) : modelOutputSchema.parse(first)
      } catch {
        const retry = await callOpenAiJsonObject(chatMessages)
        parsed = patchMode ? modelPatchOutputSchema.parse(retry) : modelOutputSchema.parse(retry)
      }
    }

    if (patchMode) {
      const p = parsed as z.infer<typeof modelPatchOutputSchema>
      const existingFiles: Record<string, string> = {
        "/App.tsx": body.refineFrom?.appTsx ?? "",
        ...(body.refineFrom?.extraFiles ?? {}),
      }
      let merged = { ...existingFiles }
      const allChangedPaths = new Set<string>()

      for (const [path, diff] of Object.entries(p.patches ?? {})) {
        if (!diff?.trim()) continue
        const applied = applyUnifiedDiffToVirtualFiles(merged, diff)
        merged = applied.patched
        for (const c of applied.changed) allChangedPaths.add(c)
      }

      const appTsx = merged["/App.tsx"]
      if (!appTsx?.trim()) {
        return NextResponse.json({ error: "Patch mode produced empty /App.tsx" }, { status: 422 })
      }
      const extra = filterModelFiles(
        Object.fromEntries(Object.entries(merged).filter(([k]) => k !== "/App.tsx")),
      )

      const normalized = generateResponseSchema.parse({
        reply: p.reply,
        appTsx,
        extraFiles: Object.keys(extra ?? {}).length ? extra : undefined,
        changedFiles: [...allChangedPaths].sort(),
      })

      const usage = estimateUsageAndCharge({
        aiProviderChoice: body.flags?.aiProvider,
        inputText: `${system}\n\n${outboundMessages.map((m) => `${m.role}: ${m.content}`).join("\n")}`,
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
        meta: { kind: "generate", patchMode: true },
      })
      const capped = firstBuild
        ? await applyFreeFirstBuildCap({ userId, phase: "generate", chargedUsd: usage.chargedUsd, capUsd: 3 })
        : { finalChargedUsd: usage.chargedUsd, discountUsd: 0 }
      await insertCreditsLedgerEntriesSplit({
        userId,
        kind: "usage_charge",
        totalChargeUsd: capped.finalChargedUsd,
        splitUsd: 1,
        meta: firstBuild
          ? { kind: "first_build", month: currentMonthKeyUtc(), phase: "generate", provider: usage.provider, model: usage.model }
          : { kind: "generate", provider: usage.provider, model: usage.model },
      })

      return NextResponse.json(normalized)
    }

    const full = parsed as z.infer<typeof modelOutputSchema>
    const extra = full.extraFiles ? filterModelFiles(full.extraFiles) : undefined

    const normalized = generateResponseSchema.parse({
      reply: full.reply,
      appTsx: full.appTsx,
      extraFiles: Object.keys(extra ?? {}).length ? extra : undefined,
    })

    const usage = estimateUsageAndCharge({
      aiProviderChoice: body.flags?.aiProvider,
      inputText: `${system}\n\n${outboundMessages.map((m) => `${m.role}: ${m.content}`).join("\n")}`,
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
      meta: { kind: "generate", patchMode: false },
    })
    const capped = firstBuild
      ? await applyFreeFirstBuildCap({ userId, phase: "generate", chargedUsd: usage.chargedUsd, capUsd: 3 })
      : { finalChargedUsd: usage.chargedUsd, discountUsd: 0 }
    await insertCreditsLedgerEntriesSplit({
      userId,
      kind: "usage_charge",
      totalChargeUsd: capped.finalChargedUsd,
      splitUsd: 1,
      meta: firstBuild
        ? { kind: "first_build", month: currentMonthKeyUtc(), phase: "generate", provider: usage.provider, model: usage.model }
        : { kind: "generate", provider: usage.provider, model: usage.model },
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
