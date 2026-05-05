import { GoogleAuth } from "google-auth-library"

/** Parsed service account JSON from env (not from key file path). */
export function loadServiceAccountJsonFromEnv():
  | Record<string, unknown>
  | undefined {
  const b64 = process.env.GOOGLE_SERVICE_ACCOUNT_JSON_B64?.trim()
  if (b64) {
    const json = Buffer.from(b64, "base64").toString("utf8")
    return JSON.parse(json) as Record<string, unknown>
  }
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim()
  if (raw) {
    return JSON.parse(raw) as Record<string, unknown>
  }
  return undefined
}

/**
 * Resolves GCP project id: env override, then `project_id` inside service account JSON,
 * then `GoogleAuth.getProjectId()` (works with GOOGLE_APPLICATION_CREDENTIALS key file).
 */
export async function resolveGcpProjectId(): Promise<string> {
  const fromEnv = process.env.GOOGLE_CLOUD_PROJECT?.trim()
  if (fromEnv) return fromEnv

  const embedded = loadServiceAccountJsonFromEnv()
  const fromJson =
    embedded && typeof embedded.project_id === "string"
      ? embedded.project_id.trim()
      : ""
  if (fromJson) return fromJson

  const credentials = embedded
  const keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim()
  const auth = new GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/cloud-platform"],
    ...(credentials ? { credentials } : keyFile ? { keyFilename: keyFile } : {}),
  })
  const id = await auth.getProjectId().catch(() => undefined)
  if (id?.trim()) return id.trim()

  throw new Error(
    "Could not determine GCP project id. Either set GOOGLE_CLOUD_PROJECT, or use a service account JSON that includes \"project_id\", or point GOOGLE_APPLICATION_CREDENTIALS to a key file and set GOOGLE_CLOUD_PROJECT.",
  )
}

export async function getVertexAccessToken(): Promise<string> {
  const credentials = loadServiceAccountJsonFromEnv()
  const keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim()
  const auth = new GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/cloud-platform"],
    ...(credentials ? { credentials } : keyFile ? { keyFilename: keyFile } : {}),
  })
  const client = await auth.getClient()
  const tok = await client.getAccessToken()
  if (!tok.token) {
    throw new Error(
      "Failed to obtain Google Cloud access token. Set GOOGLE_SERVICE_ACCOUNT_JSON (or _B64), or GOOGLE_APPLICATION_CREDENTIALS.",
    )
  }
  return tok.token
}
