import { NextResponse } from "next/server"
import { requireBuildAiUserIdFromRequest } from "@/lib/auth/buildai-supabase-admin"
import { getBuildAiSupabaseAdmin } from "@/lib/auth/buildai-supabase-admin"
import { getSupabaseOAuthToken } from "@/lib/service/supabase-oauth"

export const runtime = "nodejs"

export async function GET(req: Request) {
  try {
    const userId = await requireBuildAiUserIdFromRequest(req)
    const token = await getSupabaseOAuthToken(userId)
    const admin = getBuildAiSupabaseAdmin()
    const conn = await admin
      .from("supabase_connections")
      .select("id, project_ref, supabase_url, anon_key, region, label, updated_at")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(20)
    if (conn.error) throw new Error(conn.error.message)
    return NextResponse.json({
      oauthConnected: Boolean(token?.access_token),
      connections: conn.data ?? [],
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed"
    const status = msg.toLowerCase().includes("unauthorized") ? 401 : 400
    return NextResponse.json({ error: msg }, { status })
  }
}

