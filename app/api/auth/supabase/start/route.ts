import { NextResponse } from "next/server"
import { resolvePublicSiteUrl } from "@/lib/site-url"

export const runtime = "nodejs"

/**
 * Server-side entry to Google OAuth via Supabase Hosted. Redirects the browser to Supabase authorize URL.
 * Prefer client `signInWithOAuth` when using PKCE-in-browser; this route is useful for deep links and tests.
 */
export async function GET(req: Request): Promise<NextResponse> {
  const supabaseUrl = process.env.NEXT_PUBLIC_BUILDAI_SUPABASE_URL?.trim().replace(/\/$/, "")
  if (!supabaseUrl) {
    return NextResponse.json(
      { error: "Missing NEXT_PUBLIC_BUILDAI_SUPABASE_URL. Add it in Vercel Environment Variables." },
      { status: 503 },
    )
  }

  const site = resolvePublicSiteUrl(req.url)
  const callbackPath = "/auth/callback"
  const redirectTo = `${site}${callbackPath}`

  const authorize = new URL(`${supabaseUrl}/auth/v1/authorize`)
  authorize.searchParams.set("provider", "google")
  authorize.searchParams.set("redirect_to", redirectTo)

  return NextResponse.redirect(authorize.toString(), 302)
}
