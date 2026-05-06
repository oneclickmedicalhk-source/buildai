import { NextResponse } from "next/server"
import { requireBuildAiUserIdFromRequest } from "@/lib/auth/buildai-supabase-admin"
import {
  cryptoRandomState,
  pkceChallenge,
  pkceVerifier,
  supabaseOAuthAuthorizeUrl,
} from "@/lib/supabase-management"
import { resolvePublicSiteUrl } from "@/lib/site-url"
import { insertOAuthState } from "@/lib/service/supabase-oauth"

export const runtime = "nodejs"

export async function POST(req: Request) {
  try {
    const userId = await requireBuildAiUserIdFromRequest(req)
    const clientId = process.env.SUPABASE_OAUTH_CLIENT_ID?.trim()
    if (!clientId) return NextResponse.json({ error: "Missing SUPABASE_OAUTH_CLIENT_ID" }, { status: 503 })

    const site = resolvePublicSiteUrl(req.url)
    const redirectUri = process.env.SUPABASE_OAUTH_REDIRECT_URI?.trim() || `${site}/api/oauth/supabase/callback`

    const state = cryptoRandomState()
    const verifier = pkceVerifier()
    const challenge = pkceChallenge(verifier)

    await insertOAuthState({ userId, state, codeVerifier: verifier, redirectUri, ttlSeconds: 10 * 60 })

    const scope = [
      "organizations:read",
      "projects:write",
      "secrets:read",
      "database:write",
    ].join(" ")

    const url = supabaseOAuthAuthorizeUrl({
      clientId,
      redirectUri,
      state,
      codeChallenge: challenge,
      scope,
    })

    return NextResponse.json({ url })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed"
    const status = msg.toLowerCase().includes("unauthorized") ? 401 : 400
    return NextResponse.json({ error: msg }, { status })
  }
}

