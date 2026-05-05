import { createClient, type SupabaseClient } from "@supabase/supabase-js"

let cached: SupabaseClient | null = null

function readEnv(name: string): string | null {
  const v = process.env[name]
  return v?.trim() ? v : null
}

export function getBuildAiSupabaseBrowser(): SupabaseClient {
  if (cached) return cached
  const url = readEnv("NEXT_PUBLIC_BUILDAI_SUPABASE_URL")
  const anonKey = readEnv("NEXT_PUBLIC_BUILDAI_SUPABASE_ANON_KEY")
  if (!url || !anonKey) {
    // Avoid crashing during build/prerender when env is not configured yet.
    // Callers should treat this as "auth unavailable" and show login/config guidance.
    cached = createClient("http://127.0.0.1:54321", "anon", {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    })
    return cached
  }
  cached = createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  })
  return cached
}

