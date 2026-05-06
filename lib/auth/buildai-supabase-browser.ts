import { createClient, type SupabaseClient } from "@supabase/supabase-js"

let cached: SupabaseClient | null = null

function readEnv(name: string): string | null {
  const v = process.env[name]
  return v?.trim() ? v : null
}

/** Reads public Supabase env at runtime (use from Server Components / layouts). Matches `/api/diagnostics`. */
export function readBuildAiSupabasePublicEnv(): { url: string; anonKey: string } | null {
  const url = readEnv("NEXT_PUBLIC_BUILDAI_SUPABASE_URL")
  const anonKey = readEnv("NEXT_PUBLIC_BUILDAI_SUPABASE_ANON_KEY")
  if (!url || !anonKey) return null
  return { url, anonKey }
}

/** Placeholder client when env is missing — avoids crashes; auth calls should be gated. */
export function createUnconfiguredBuildAiSupabaseBrowser(): SupabaseClient {
  return createClient("http://127.0.0.1:54321", "anon", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
}

/**
 * Prefer passing URL + anon from the root layout so production matches server diagnostics.
 * Client-only `NEXT_PUBLIC_*` reads can be stale if an old JS bundle is cached without inlined env.
 */
export function createBuildAiSupabaseBrowserExplicit(url: string, anonKey: string): SupabaseClient {
  return createClient(url.trim(), anonKey.trim(), {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  })
}

/** True when Vercel has public Supabase URL + anon key — auth and API Bearer tokens apply. */
export function isBuildAiSupabaseBrowserConfigured(): boolean {
  return Boolean(readEnv("NEXT_PUBLIC_BUILDAI_SUPABASE_URL") && readEnv("NEXT_PUBLIC_BUILDAI_SUPABASE_ANON_KEY"))
}

export function getBuildAiSupabaseBrowser(): SupabaseClient {
  if (cached) return cached
  const pair = readBuildAiSupabasePublicEnv()
  if (!pair) {
    // Avoid crashing during build/prerender when env is not configured yet.
    cached = createUnconfiguredBuildAiSupabaseBrowser()
    return cached
  }
  cached = createBuildAiSupabaseBrowserExplicit(pair.url, pair.anonKey)
  return cached
}

