import { NextResponse } from "next/server"
import { requireBuildAiUserIdFromRequest, getBuildAiSupabaseAdmin } from "@/lib/auth/buildai-supabase-admin"

export const runtime = "nodejs"

export async function GET(req: Request) {
  try {
    const userId = await requireBuildAiUserIdFromRequest(req)
    const url = new URL(req.url)
    const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") ?? "50")))
    const admin = getBuildAiSupabaseAdmin()
    const res = await admin
      .from("usage_events")
      .select("id, ts, provider, model, input_tokens, output_tokens, cost_usd, charged_usd, request_id, meta")
      .eq("user_id", userId)
      .order("ts", { ascending: false })
      .limit(limit)
    if (res.error) throw new Error(res.error.message)
    return NextResponse.json({ rows: res.data ?? [] })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed"
    const status = msg.toLowerCase().includes("unauthorized") ? 401 : 400
    return NextResponse.json({ error: msg }, { status })
  }
}

