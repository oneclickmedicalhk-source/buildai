import { createClient, type SupabaseClient } from "@supabase/supabase-js"

let cached: SupabaseClient | null = null

function mustEnv(name: string): string {
  const v = process.env[name]
  if (!v?.trim()) throw new Error(`Missing ${name}`)
  return v
}

export function getBuildAiSupabaseAdmin(): SupabaseClient {
  if (cached) return cached
  const url = mustEnv("NEXT_PUBLIC_BUILDAI_SUPABASE_URL")
  const serviceRole = mustEnv("BUILDAI_SUPABASE_SERVICE_ROLE_KEY")
  cached = createClient(url, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  return cached
}

export async function requireBuildAiUserIdFromRequest(req: Request): Promise<string> {
  const auth = req.headers.get("authorization") || req.headers.get("Authorization")
  const token = auth?.startsWith("Bearer ") ? auth.slice("Bearer ".length).trim() : ""
  if (!token) throw new Error("Unauthorized: missing Bearer token")
  const admin = getBuildAiSupabaseAdmin()
  const { data, error } = await admin.auth.getUser(token)
  if (error || !data.user?.id) throw new Error("Unauthorized: invalid session")
  return data.user.id
}

