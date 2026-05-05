import { createClient, type SupabaseClient } from "@supabase/supabase-js"

type AdminSupabase = {
  client: SupabaseClient
}

function mustEnv(name: string): string {
  const v = process.env[name]
  if (!v?.trim()) throw new Error(`Missing ${name}`)
  return v
}

export function getSyncSupabaseAdmin(): AdminSupabase {
  const url = mustEnv("BUILDAI_SYNC_SUPABASE_URL")
  const serviceRoleKey = mustEnv("BUILDAI_SYNC_SUPABASE_SERVICE_ROLE_KEY")
  const client = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  return { client }
}

