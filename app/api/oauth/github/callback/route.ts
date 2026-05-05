import { NextResponse } from "next/server"
import { encryptJson } from "@/lib/secure-token"

type GithubTokenResponse = {
  access_token?: string
  scope?: string
  token_type?: string
  error?: string
  error_description?: string
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const code = url.searchParams.get("code")
  const state = url.searchParams.get("state")

  if (!code || !state) {
    return NextResponse.json({ error: "Missing code/state" }, { status: 400 })
  }

  const stateCookie = (await cookiesFromRequest(req)).get("buildai_oauth_state")?.value
  if (!stateCookie || stateCookie !== state) {
    return NextResponse.json({ error: "OAuth state mismatch" }, { status: 400 })
  }

  const clientId = process.env.GITHUB_CLIENT_ID?.trim()
  const clientSecret = process.env.GITHUB_CLIENT_SECRET?.trim()
  if (!clientId || !clientSecret) {
    return NextResponse.json({ error: "Missing GITHUB_CLIENT_ID/GITHUB_CLIENT_SECRET" }, { status: 503 })
  }

  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
    }),
  })

  const data = (await tokenRes.json()) as GithubTokenResponse
  if (!tokenRes.ok || !data.access_token) {
    return NextResponse.json({ error: data.error_description ?? data.error ?? "GitHub OAuth failed" }, { status: 400 })
  }

  const res = NextResponse.redirect(`${url.origin}/?publish=1`)
  res.cookies.delete("buildai_oauth_state")
  res.cookies.set(
    "buildai_github",
    encryptJson({
      accessToken: data.access_token,
      scope: data.scope ?? "",
      tokenType: data.token_type ?? "bearer",
      savedAt: Date.now(),
    }),
    { httpOnly: true, sameSite: "lax", path: "/", maxAge: 30 * 24 * 60 * 60 },
  )
  return res
}

async function cookiesFromRequest(req: Request): Promise<ReturnType<typeof import("next/headers")["cookies"]>> {
  // `cookies()` only works in a Next request context; dynamic import keeps edge warnings away.
  const mod = await import("next/headers")
  return mod.cookies()
}

