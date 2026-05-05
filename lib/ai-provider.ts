/**
 * Chooses which LLM backend `/api/generate` uses.
 * - `vertex_gemini`: **Gemini** — service account → Vertex; API key only → Gemini Developer API (`generativelanguage.googleapis.com`).
 * - `vertex_claude`: Anthropic **Claude** on Vertex (service account only; not API key).
 * - `openai`: OpenAI-compatible Chat Completions.
 */
export type AiProviderId = "openai" | "vertex_claude" | "vertex_gemini"

/** User-selected backend; `auto` follows env + `resolveAiProvider()`. */
export type AiProviderChoice = AiProviderId | "auto"

function hasVertexServiceAccountInEnv(): boolean {
  return (
    Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim()) ||
    Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_JSON_B64?.trim())
  )
}

function hasVertexApiKey(): boolean {
  return Boolean(
    process.env.GOOGLE_API_KEY?.trim() ||
      process.env.GEMINI_API_KEY?.trim() ||
      process.env.VERTEX_GOOGLE_API_KEY?.trim(),
  )
}

export function resolveAiProvider(): AiProviderId {
  const explicit = process.env.AI_PROVIDER?.trim().toLowerCase()
  if (explicit === "openai") return "openai"

  if (explicit === "vertex_claude" || explicit === "claude") {
    return "vertex_claude"
  }
  if (explicit === "vertex_gemini" || explicit === "gemini") {
    return "vertex_gemini"
  }

  /** Broad aliases → Gemini on Vertex. */
  if (
    explicit === "google" ||
    explicit === "vertex" ||
    explicit === "google_cloud"
  ) {
    return "vertex_gemini"
  }

  const hasKeyFile = Boolean(process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim())

  /** Console **API key** — Gemini Developer API (not Vertex OAuth). */
  if (hasVertexApiKey()) return "vertex_gemini"

  if (hasVertexServiceAccountInEnv()) return "vertex_gemini"
  /** Key file alone is enough: `project_id` is inside the JSON; token + project resolve at runtime. */
  if (hasKeyFile) return "vertex_gemini"

  return "openai"
}

/** True when OpenAI Chat Completions can be called. */
export function isOpenAiConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim())
}

/** True when Gemini (Developer API key and/or Vertex) can be used. */
export function isVertexGeminiConfigured(): boolean {
  return (
    hasVertexApiKey() ||
    hasVertexServiceAccountInEnv() ||
    Boolean(process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim())
  )
}

/** Claude on Vertex requires OAuth-style GCP credentials (not consumer API key alone). */
export function isVertexClaudeConfigured(): boolean {
  return hasVertexServiceAccountInEnv() || Boolean(process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim())
}

/**
 * Returns null if this provider can run; otherwise a short human-readable reason (for API 503).
 */
export function getProviderUnavailableReason(id: AiProviderId): string | null {
  if (id === "openai") {
    return isOpenAiConfigured() ? null : "OPENAI_API_KEY is not set."
  }
  if (id === "vertex_gemini") {
    return isVertexGeminiConfigured()
      ? null
      : "No Gemini auth: set GOOGLE_API_KEY / GEMINI_API_KEY, or Vertex service account / GOOGLE_APPLICATION_CREDENTIALS."
  }
  if (id === "vertex_claude") {
    return isVertexClaudeConfigured()
      ? null
      : "Claude on Vertex needs GOOGLE_SERVICE_ACCOUNT_JSON, GOOGLE_SERVICE_ACCOUNT_JSON_B64, or GOOGLE_APPLICATION_CREDENTIALS."
  }
  return null
}

/**
 * Resolves which backend to use for one request.
 * - `auto` or undefined → same as `resolveAiProvider()` (env `AI_PROVIDER` + available keys).
 * - explicit id → that id (caller should verify with `getProviderUnavailableReason`).
 */
export function resolveAiProviderForRequest(choice?: AiProviderChoice): AiProviderId {
  if (choice == null || choice === "auto") {
    return resolveAiProvider()
  }
  return choice
}
