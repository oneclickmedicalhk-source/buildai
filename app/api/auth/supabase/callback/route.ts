import { NextResponse } from "next/server"
import { resolvePublicSiteUrl } from "@/lib/site-url"

export const runtime = "nodejs"

/**
 * If Supabase redirect URL is pointed at this route, forward query parameters to the SPA callback
 * so `@supabase/supabase-js` can complete the session from the URL fragment or code (flow-dependent).
 */
export async function GET(req: Request): Promise<NextResponse> {
  const site = resolvePublicSiteUrl(req.url)
  const incoming = new URL(req.url)
  const target = new URL(`${site}/auth/callback`)
  incoming.searchParams.forEach((v, k) => target.searchParams.set(k, v))

  return NextResponse.redirect(target.toString(), 307)
}
