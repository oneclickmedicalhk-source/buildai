import { NextResponse } from "next/server"
import { readBuildAiSupabasePublicEnv } from "@/lib/auth/buildai-supabase-browser"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Public bootstrap for the browser Supabase client when RSC props or inlined
 * `NEXT_PUBLIC_*` are missing (stale CDN bundle, prerender edge cases).
 * Anon key is intended to be public (RLS); never return service_role here.
 */
export async function GET() {
  const env = readBuildAiSupabasePublicEnv()
  if (!env) {
    return NextResponse.json(
      { configured: false as const },
      {
        status: 200,
        headers: { "Cache-Control": "no-store, max-age=0" },
      },
    )
  }
  return NextResponse.json(
    { configured: true as const, url: env.url, anonKey: env.anonKey },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  )
}
