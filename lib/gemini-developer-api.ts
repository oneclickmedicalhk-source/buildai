/**
 * **Gemini Developer API** (Google AI Studio / “API key” flow).
 *
 * Uses `generativelanguage.googleapis.com` with `?key=...` — this is what a
 * Cloud Console **API key** (`AIza...`) is for. It is **not** the Vertex AI
 * platform host (`aiplatform.googleapis.com`), which requires OAuth2.
 *
 * Quota / 429: we retry once after `Retry-After` or “Please retry in …s”, then
 * try fallback models (`GEMINI_API_MODEL_FALLBACKS`) so different model quotas
 * can still succeed.
 *
 * @see https://ai.google.dev/gemini-api/docs/quickstart
 */

export interface GeminiDeveloperMessage {
  role: "user" | "assistant"
  content: string
}

interface GenerateContentResponse {
  candidates?: {
    content?: { parts?: { text?: string }[] }
    finishReason?: string
  }[]
  promptFeedback?: { blockReason?: string }
  error?: { message?: string; code?: number }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Parses “Please retry in 45.84s” from Gemini error bodies. */
function parseRetryMsFromMessage(message: string): number | undefined {
  const m = message.match(/Please retry in ([\d.]+)\s*s\b/i)
  if (!m) return undefined
  const sec = Number(m[1])
  if (!Number.isFinite(sec) || sec <= 0) return undefined
  return Math.min(Math.ceil(sec * 1000), 120_000)
}

function parseRetryAfterHeader(header: string | null): number | undefined {
  if (!header?.trim()) return undefined
  const sec = Number(header.trim())
  if (!Number.isFinite(sec) || sec <= 0) return undefined
  return Math.min(Math.ceil(sec * 1000), 120_000)
}

function parseGenerateContentBody(data: GenerateContentResponse): string {
  const block = data.promptFeedback?.blockReason
  if (block) {
    throw new Error(`Gemini API blocked the prompt: ${block}`)
  }

  const candidate = data.candidates?.[0]
  const reason = candidate?.finishReason
  if (reason && reason !== "STOP" && reason !== "MAX_TOKENS") {
    throw new Error(`Gemini API finish reason: ${reason}`)
  }

  const parts = candidate?.content?.parts
  const text =
    parts?.map((p) => (typeof p.text === "string" ? p.text : "")).join("") ?? ""
  if (!text.trim()) {
    throw new Error("Empty response from Gemini API")
  }
  return text.trim()
}

function defaultFallbackModels(): string[] {
  return ["gemini-2.0-flash", "gemini-1.5-flash", "gemini-2.5-flash-lite"]
}

function resolveModelChain(): string[] {
  /** Do not read `VERTEX_GEMINI_MODEL` here — Vertex IDs (e.g. `…-001`) often differ from Gemini API model names. */
  const primary = process.env.GEMINI_API_MODEL?.trim() || "gemini-2.5-flash"

  const rawFallbacks = process.env.GEMINI_API_MODEL_FALLBACKS?.trim()
  const fallbacks = rawFallbacks
    ? rawFallbacks
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : defaultFallbackModels()

  const out: string[] = []
  const seen = new Set<string>()
  for (const m of [primary, ...fallbacks]) {
    if (!seen.has(m)) {
      seen.add(m)
      out.push(m)
    }
  }
  return out
}

function buildRequestBody(params: {
  system: string
  messages: GeminiDeveloperMessage[]
}) {
  const contents = params.messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }))

  return {
    systemInstruction: { parts: [{ text: params.system }] },
    contents,
    generationConfig: {
      temperature: 0.4,
      responseMimeType: "application/json",
    },
  }
}

function quotaHint(): string {
  return (
    " If every model returns 429 with limit 0, enable billing / Generative Language API for this Cloud project, or use Vertex with GOOGLE_SERVICE_ACCOUNT_JSON."
  )
}

/** Consumer Gemini API blocks some client regions (e.g. Hong Kong) by IP. */
function isGeminiGeoBlocked(status: number, message: string): boolean {
  if (status !== 400) return false
  const m = message.toLowerCase()
  return (
    m.includes("location is not supported") ||
    m.includes("user location is not supported") ||
    m.includes("country is not supported") ||
    m.includes("region is not supported")
  )
}

/**
 * Calls `generateContent` on the public Gemini API with an API key.
 */
export async function geminiDeveloperGenerateJson(params: {
  apiKey: string
  system: string
  messages: GeminiDeveloperMessage[]
}): Promise<string> {
  const base =
    process.env.GEMINI_API_BASE_URL?.trim() ||
    "https://generativelanguage.googleapis.com"
  const baseNorm = base.replace(/\/$/, "")
  const body = buildRequestBody(params)

  const models = resolveModelChain()
  let lastMessage = ""

  for (const model of models) {
    const modelEnc = encodeURIComponent(model)
    const url = `${baseNorm}/v1beta/models/${modelEnc}:generateContent?key=${encodeURIComponent(params.apiKey)}`

    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json; charset=utf-8",
        },
        body: JSON.stringify(body),
      })

      const data = (await res.json()) as GenerateContentResponse
      const msg = data.error?.message ?? res.statusText
      lastMessage = msg

      if (res.ok) {
        return parseGenerateContentBody(data)
      }

      if (res.status === 429 && attempt === 0) {
        const waitMs =
          parseRetryAfterHeader(res.headers.get("retry-after")) ??
          parseRetryMsFromMessage(msg)
        if (waitMs !== undefined) {
          await sleep(waitMs)
          continue
        }
      }

      if (res.status === 429) {
        break
      }

      if (isGeminiGeoBlocked(res.status, msg)) {
        throw new Error(
          `Gemini API (API key) failed (${res.status}): region not supported for the consumer Gemini API from your network (e.g. Hong Kong). Remove GOOGLE_API_KEY-only setup and add GOOGLE_SERVICE_ACCOUNT_JSON (or GOOGLE_APPLICATION_CREDENTIALS) to use Vertex AI Gemini, or use OPENAI_API_KEY with AI_PROVIDER=openai. Original: ${msg}`,
        )
      }

      throw new Error(`Gemini API (API key) failed (${res.status}): ${msg}`)
    }
  }

  const short =
    lastMessage.length > 800 ? `${lastMessage.slice(0, 800)}…` : lastMessage
  throw new Error(
    `Gemini API (API key) failed (429) after retries / model fallbacks (${models.join(" → ")}). ${short}${quotaHint()}`,
  )
}
