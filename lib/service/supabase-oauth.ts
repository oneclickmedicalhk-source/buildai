import { getBuildAiSupabaseAdmin } from "@/lib/auth/buildai-supabase-admin"
import { decryptJson, encryptJson } from "@/lib/secure-token"
import type { SupabaseOAuthToken } from "@/lib/supabase-management"

const PROVIDER = "supabase"

export async function upsertSupabaseOAuthToken(userId: string, token: SupabaseOAuthToken): Promise<void> {
  const admin = getBuildAiSupabaseAdmin()
  const res = await admin.from("oauth_tokens").upsert(
    {
      user_id: userId,
      provider: PROVIDER,
      token_encrypted: encryptJson(token),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,provider" },
  )
  if (res.error) throw new Error(res.error.message)
}

export async function getSupabaseOAuthToken(userId: string): Promise<SupabaseOAuthToken | null> {
  const admin = getBuildAiSupabaseAdmin()
  const res = await admin
    .from("oauth_tokens")
    .select("token_encrypted")
    .eq("user_id", userId)
    .eq("provider", PROVIDER)
    .maybeSingle()
  if (res.error) throw new Error(res.error.message)
  if (!res.data?.token_encrypted) return null
  return decryptJson<SupabaseOAuthToken>(res.data.token_encrypted)
}

export async function insertOAuthState(params: {
  userId: string
  state: string
  codeVerifier: string
  redirectUri: string
  ttlSeconds: number
}): Promise<void> {
  const admin = getBuildAiSupabaseAdmin()
  const expiresAt = new Date(Date.now() + params.ttlSeconds * 1000).toISOString()
  const res = await admin.from("oauth_states").insert({
    user_id: params.userId,
    provider: PROVIDER,
    state: params.state,
    code_verifier: params.codeVerifier,
    redirect_uri: params.redirectUri,
    expires_at: expiresAt,
  })
  if (res.error) throw new Error(res.error.message)
}

export async function consumeOAuthState(params: { state: string }): Promise<{
  userId: string
  codeVerifier: string
  redirectUri: string
} | null> {
  const admin = getBuildAiSupabaseAdmin()
  const row = await admin
    .from("oauth_states")
    .select("id, user_id, code_verifier, redirect_uri, expires_at")
    .eq("provider", PROVIDER)
    .eq("state", params.state)
    .maybeSingle()
  if (row.error) throw new Error(row.error.message)
  if (!row.data) return null
  if (new Date(row.data.expires_at).getTime() < Date.now()) {
    await admin.from("oauth_states").delete().eq("id", row.data.id)
    return null
  }
  await admin.from("oauth_states").delete().eq("id", row.data.id)
  return {
    userId: row.data.user_id,
    codeVerifier: row.data.code_verifier,
    redirectUri: row.data.redirect_uri,
  }
}

