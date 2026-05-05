import { NextResponse } from "next/server"
import crypto from "node:crypto"

export async function GET(req: Request) {
  const url = new URL(req.url)
  const origin = url.origin
  const clientId = process.env.VERCEL_CLIENT_ID?.trim()
  if (!clientId) {
    return NextResponse.json({ error: "Missing VERCEL_CLIENT_ID" }, { status: 503 })
  }
  const state = crypto.randomBytes(24).toString("base64url")
  const redirectUri = `${origin}/api/oauth/vercel/callback`
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
  })
  const res = NextResponse.redirect(`https://vercel.com/oauth/authorize?${params.toString()}`)
  res.cookies.set("buildai_oauth_state_vercel", state, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 10 * 60 })
  return res
}

