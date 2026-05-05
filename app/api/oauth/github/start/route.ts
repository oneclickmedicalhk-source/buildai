import { NextResponse } from "next/server"
import crypto from "node:crypto"

export async function GET(req: Request) {
  const url = new URL(req.url)
  const origin = url.origin
  const clientId = process.env.GITHUB_CLIENT_ID?.trim()
  if (!clientId) {
    return NextResponse.json({ error: "Missing GITHUB_CLIENT_ID" }, { status: 503 })
  }
  const state = cryptoRandomState()
  const redirectUri = `${origin}/api/oauth/github/callback`
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: "repo",
    state,
  })
  const res = NextResponse.redirect(`https://github.com/login/oauth/authorize?${params.toString()}`)
  res.cookies.set("buildai_oauth_state", state, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 10 * 60 })
  return res
}

function cryptoRandomState(): string {
  // 24 bytes → ~32 chars base64url; good enough for CSRF state.
  return crypto.randomBytes(24).toString("base64url")
}

