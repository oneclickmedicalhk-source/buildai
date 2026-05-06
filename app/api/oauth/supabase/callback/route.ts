import { NextResponse } from "next/server"
import { exchangeSupabaseOAuthCode } from "@/lib/supabase-management"
import { consumeOAuthState, upsertSupabaseOAuthToken } from "@/lib/service/supabase-oauth"

export const runtime = "nodejs"

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const code = url.searchParams.get("code")
    const state = url.searchParams.get("state")
    if (!code || !state) return NextResponse.json({ error: "Missing code/state" }, { status: 400 })

    const consumed = await consumeOAuthState({ state })
    if (!consumed) return NextResponse.json({ error: "OAuth state invalid/expired" }, { status: 400 })

    const token = await exchangeSupabaseOAuthCode({
      code,
      redirectUri: consumed.redirectUri,
      codeVerifier: consumed.codeVerifier,
    })
    await upsertSupabaseOAuthToken(consumed.userId, token)

    // Return user to app; Integrations dialog will refresh status.
    return NextResponse.redirect(`${url.origin}/?integrations=supabase`, 302)
  } catch (e) {
    const msg = e instanceof Error ? e.message : "OAuth callback failed"
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}

