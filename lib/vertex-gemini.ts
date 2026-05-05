/**
 * **Gemini** backends used when `AI_PROVIDER` resolves to Vertex-style Gemini:
 *
 * 1) **Vertex AI** — OAuth2 bearer (`GOOGLE_SERVICE_ACCOUNT_JSON` or
 *    `GOOGLE_APPLICATION_CREDENTIALS`). Regional
 *    `projects/.../locations/.../publishers/google/models/...:generateContent`.
 *
 * 2) **Gemini Developer API** — Console **API key** (`GOOGLE_API_KEY` / `GEMINI_API_KEY`).
 *    Host: `generativelanguage.googleapis.com` (**not** Vertex; Vertex rejects `?key=`).
 *
 * If both OAuth credentials and an API key exist, **OAuth (Vertex)** is preferred.
 */
import {
  getVertexAccessToken,
  loadServiceAccountJsonFromEnv,
  resolveGcpProjectId,
} from "@/lib/vertex-credentials"
import { vertexRegionalHost } from "@/lib/vertex-host"
import { geminiDeveloperGenerateJson } from "@/lib/gemini-developer-api"

export interface VertexGeminiMessage {
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

function readApiKeyFromEnv(): string | undefined {
  const k =
    process.env.GOOGLE_API_KEY?.trim() ||
    process.env.GEMINI_API_KEY?.trim() ||
    process.env.VERTEX_GOOGLE_API_KEY?.trim()
  return k || undefined
}

function hasVertexOAuthEnv(): boolean {
  return (
    Boolean(loadServiceAccountJsonFromEnv()) ||
    Boolean(process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim())
  )
}

function parseGenerateContentBody(data: GenerateContentResponse): string {
  const block = data.promptFeedback?.blockReason
  if (block) {
    throw new Error(`Vertex Gemini blocked the prompt: ${block}`)
  }

  const candidate = data.candidates?.[0]
  const reason = candidate?.finishReason
  if (reason && reason !== "STOP" && reason !== "MAX_TOKENS") {
    throw new Error(`Vertex Gemini finish reason: ${reason}`)
  }

  const parts = candidate?.content?.parts
  const text =
    parts?.map((p) => (typeof p.text === "string" ? p.text : "")).join("") ?? ""
  if (!text.trim()) {
    throw new Error("Empty response from Vertex Gemini")
  }
  return text.trim()
}

/** Service-account OAuth on regional `projects/.../locations/.../publishers/google/models/...`. */
async function vertexGeminiWithBearer(params: {
  system: string
  messages: VertexGeminiMessage[]
}): Promise<string> {
  const project = await resolveGcpProjectId()
  /**
   * Gemini publisher models are usually called on `locations/global` in docs.
   * Regional endpoints (e.g. `asia-east2`) often 404 for the same model id.
   * Set `VERTEX_GEMINI_LOCATION` only if you need a specific region that supports your model.
   */
  const location = process.env.VERTEX_GEMINI_LOCATION?.trim() || "global"
  const model =
    process.env.VERTEX_GEMINI_MODEL?.trim() || "gemini-2.5-flash"

  const token = await getVertexAccessToken()
  const host = vertexRegionalHost(location)
  const modelEnc = encodeURIComponent(model)
  const url = `https://${host}/v1/projects/${project}/locations/${location}/publishers/google/models/${modelEnc}:generateContent`

  const contents = params.messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }))

  const body = {
    systemInstruction: { parts: [{ text: params.system }] },
    contents,
    generationConfig: {
      temperature: 0.4,
      responseMimeType: "application/json",
    },
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(body),
  })

  const data = (await res.json()) as GenerateContentResponse

  if (!res.ok) {
    const msg = data.error?.message ?? res.statusText
    throw new Error(`Vertex Gemini request failed (${res.status}): ${msg}`)
  }

  return parseGenerateContentBody(data)
}

/**
 * JSON-mode `generateContent`: Vertex (OAuth) if credentials exist; otherwise
 * Gemini Developer API with API key only.
 */
export async function vertexGeminiGenerateJson(params: {
  system: string
  messages: VertexGeminiMessage[]
}): Promise<string> {
  if (hasVertexOAuthEnv()) {
    return vertexGeminiWithBearer(params)
  }

  const apiKey = readApiKeyFromEnv()
  if (apiKey) {
    return geminiDeveloperGenerateJson({
      apiKey,
      system: params.system,
      messages: params.messages,
    })
  }

  throw new Error(
    "No Gemini auth configured. Set GOOGLE_SERVICE_ACCOUNT_JSON (or GOOGLE_APPLICATION_CREDENTIALS) for Vertex, or set GOOGLE_API_KEY / GEMINI_API_KEY for the Gemini API.",
  )
}
