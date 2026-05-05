/**
 * Calls Anthropic Claude through **Google Cloud Vertex AI** `rawPredict` (partner model).
 * This is not the consumer Gemini app; it is Anthropic on Vertex.
 */
import { getVertexAccessToken, resolveGcpProjectId } from "@/lib/vertex-credentials"
import { vertexRegionalHost } from "@/lib/vertex-host"

export interface VertexClaudeMessage {
  role: "user" | "assistant"
  content: string
}

/** Concatenate all `text` blocks from a Claude Messages-style response. */
function extractAssistantText(data: unknown): string {
  if (!data || typeof data !== "object") return ""
  const content = (data as { content?: unknown }).content
  if (!Array.isArray(content)) return ""
  const parts: string[] = []
  for (const block of content) {
    if (!block || typeof block !== "object") continue
    const b = block as { type?: string; text?: string }
    if (b.type === "text" && typeof b.text === "string") {
      parts.push(b.text)
    }
  }
  return parts.join("\n").trim()
}

/**
 * Sends system + user/assistant messages to Claude on Vertex and returns assistant text (JSON string expected).
 */
export async function vertexClaudeRawPredict(params: {
  system: string
  messages: VertexClaudeMessage[]
}): Promise<string> {
  const project = await resolveGcpProjectId()
  const location = process.env.VERTEX_LOCATION?.trim() || "asia-east2"
  const model =
    process.env.VERTEX_CLAUDE_MODEL?.trim() || "claude-sonnet-4-5@20250929"

  const token = await getVertexAccessToken()
  const host = vertexRegionalHost(location)
  const modelEnc = encodeURIComponent(model)
  const url = `https://${host}/v1/projects/${project}/locations/${location}/publishers/anthropic/models/${modelEnc}:rawPredict`

  const body = {
    anthropic_version: "vertex-2023-10-16",
    max_tokens: 8192,
    stream: false,
    temperature: 0.4,
    system: params.system,
    messages: params.messages,
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(body),
  })

  const data = (await res.json()) as {
    error?: { message?: string; code?: number }
    content?: unknown
  }

  if (!res.ok) {
    const msg = data.error?.message ?? res.statusText
    throw new Error(`Vertex Claude request failed (${res.status}): ${msg}`)
  }

  const text = extractAssistantText(data)
  if (!text) {
    throw new Error("Empty response from Vertex Claude (no text content)")
  }
  return text
}
