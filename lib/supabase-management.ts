import crypto from "node:crypto"

export type SupabaseOrganization = {
  id: string
  slug: string
  name: string
}

export type SupabaseProject = {
  id: string
  ref: string
  organization_slug: string
  name: string
  region?: string
  status?: string
}

export type SupabaseApiKey = {
  id: string
  type: string
  name?: string
  prefix?: string
  api_key?: string
}

function mustEnv(name: string): string {
  const v = process.env[name]
  if (!v?.trim()) throw new Error(`Missing ${name}`)
  return v
}

function baseUrl(): string {
  return "https://api.supabase.com"
}

export function supabaseOAuthAuthorizeUrl(params: {
  clientId: string
  redirectUri: string
  state: string
  codeChallenge: string
  scope: string
}): string {
  const u = new URL(`${baseUrl()}/v1/oauth/authorize`)
  u.searchParams.set("client_id", params.clientId)
  u.searchParams.set("response_type", "code")
  u.searchParams.set("redirect_uri", params.redirectUri)
  u.searchParams.set("scope", params.scope)
  u.searchParams.set("state", params.state)
  u.searchParams.set("code_challenge", params.codeChallenge)
  u.searchParams.set("code_challenge_method", "S256")
  return u.toString()
}

export type SupabaseOAuthToken = {
  access_token: string
  refresh_token: string
  expires_in: number
  token_type: string
  obtained_at_ms: number
  scope?: string
}

export async function exchangeSupabaseOAuthCode(args: {
  code: string
  redirectUri: string
  codeVerifier: string
}): Promise<SupabaseOAuthToken> {
  const clientId = mustEnv("SUPABASE_OAUTH_CLIENT_ID")
  const clientSecret = mustEnv("SUPABASE_OAUTH_CLIENT_SECRET")

  const res = await fetch(`${baseUrl()}/v1/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      client_id: clientId,
      client_secret: clientSecret,
      code: args.code,
      code_verifier: args.codeVerifier,
      redirect_uri: args.redirectUri,
    }),
  })
  const data = (await res.json()) as Partial<SupabaseOAuthToken> & { error?: string; error_description?: string }
  if (!res.ok || !data.access_token || !data.refresh_token || !data.expires_in) {
    throw new Error(data.error_description ?? data.error ?? "Supabase OAuth token exchange failed")
  }
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_in: Number(data.expires_in),
    token_type: data.token_type ?? "Bearer",
    obtained_at_ms: Date.now(),
    ...(data.scope ? { scope: String(data.scope) } : {}),
  }
}

export async function supabaseManagementGet<T>(path: string, accessToken: string): Promise<T> {
  const res = await fetch(`${baseUrl()}${path}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  })
  const json = (await res.json().catch(() => ({}))) as any
  if (!res.ok) {
    throw new Error(json?.message ?? json?.error ?? `Supabase Management API failed (${res.status})`)
  }
  return json as T
}

export async function supabaseManagementPost<T>(path: string, accessToken: string, body: unknown): Promise<T> {
  const res = await fetch(`${baseUrl()}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  })
  const json = (await res.json().catch(() => ({}))) as any
  if (!res.ok) {
    throw new Error(json?.message ?? json?.error ?? `Supabase Management API failed (${res.status})`)
  }
  return json as T
}

export async function listOrganizations(accessToken: string): Promise<SupabaseOrganization[]> {
  return supabaseManagementGet<SupabaseOrganization[]>("/v1/organizations", accessToken)
}

export async function createProject(args: {
  accessToken: string
  organizationSlug: string
  name: string
  dbPass: string
  regionSelection?: { kind: "closest"; preferred?: string } | { kind: "explicit"; region: string }
}): Promise<SupabaseProject> {
  const body: Record<string, unknown> = {
    organization_slug: args.organizationSlug,
    name: args.name,
    db_pass: args.dbPass,
  }
  // API lists region/plan as deprecated; region_selection exists in docs.
  if (args.regionSelection?.kind === "explicit") {
    body.region_selection = { region: args.regionSelection.region }
  } else if (args.regionSelection?.kind === "closest") {
    body.region_selection = { strategy: "closest", ...(args.regionSelection.preferred ? { preferred: args.regionSelection.preferred } : {}) }
  }
  return supabaseManagementPost<SupabaseProject>("/v1/projects", args.accessToken, body)
}

export async function getProject(accessToken: string, ref: string): Promise<SupabaseProject> {
  return supabaseManagementGet<SupabaseProject>(`/v1/projects/${encodeURIComponent(ref)}`, accessToken)
}

export async function waitForProjectReady(args: {
  accessToken: string
  ref: string
  timeoutMs?: number
}): Promise<SupabaseProject> {
  const timeoutMs = args.timeoutMs ?? 3 * 60 * 1000
  const t0 = Date.now()
  let delay = 1500
  // Poll status until ACTIVE/INACTIVE? The docs vary; treat any non-CREATING as ready.
  while (Date.now() - t0 < timeoutMs) {
    const p = await getProject(args.accessToken, args.ref)
    const st = String(p.status ?? "").toUpperCase()
    if (st && !st.includes("CREATING")) return p
    await new Promise((r) => setTimeout(r, delay))
    delay = Math.min(8000, Math.round(delay * 1.4))
  }
  throw new Error("Supabase project provisioning timed out")
}

export async function getProjectApiKeys(accessToken: string, ref: string): Promise<SupabaseApiKey[]> {
  return supabaseManagementGet<SupabaseApiKey[]>(
    `/v1/projects/${encodeURIComponent(ref)}/api-keys?reveal=true`,
    accessToken,
  )
}

export function inferAnonKeyFromApiKeys(keys: SupabaseApiKey[]): string | null {
  // New keys: publishable key looks like `sb_publishable_...` and is safe for browser.
  const publishable = keys.find((k) => (k.api_key ?? "").startsWith("sb_publishable_"))
  if (publishable?.api_key) return publishable.api_key
  // Legacy JWT anon key usually starts with `eyJ...` and may be named `anon`.
  const legacyAnon = keys.find((k) => (k.name ?? "").toLowerCase().includes("anon") || (k.prefix ?? "").toLowerCase().includes("anon"))
  if (legacyAnon?.api_key) return legacyAnon.api_key
  // Fallback: first key with api_key set.
  return keys.find((k) => Boolean(k.api_key))?.api_key ?? null
}

export async function runSql(args: { accessToken: string; ref: string; sql: string }): Promise<void> {
  await supabaseManagementPost(
    `/v1/projects/${encodeURIComponent(args.ref)}/database/query`,
    args.accessToken,
    { query: args.sql, read_only: false },
  )
}

export function cryptoRandomState(): string {
  return crypto.randomBytes(24).toString("base64url")
}

export function pkceVerifier(): string {
  return crypto.randomBytes(32).toString("base64url")
}

export function pkceChallenge(verifier: string): string {
  return crypto.createHash("sha256").update(verifier).digest().toString("base64url")
}

