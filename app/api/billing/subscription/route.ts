import { NextResponse } from "next/server"
import { requireBuildAiUserIdFromRequest, getBuildAiSupabaseAdmin } from "@/lib/auth/buildai-supabase-admin"

export const runtime = "nodejs"

export async function GET(req: Request) {
  try {
    const userId = await requireBuildAiUserIdFromRequest(req)
    const admin = getBuildAiSupabaseAdmin()
    const prof = await admin.from("profiles").select("plan, email, name, avatar_url").eq("user_id", userId).maybeSingle()
    if (prof.error) throw new Error(prof.error.message)
    const sub = await admin
      .from("subscriptions")
      .select("stripe_customer_id, stripe_subscription_id, status, current_period_end")
      .eq("user_id", userId)
      .maybeSingle()
    if (sub.error) throw new Error(sub.error.message)
    return NextResponse.json({
      profile: prof.data ?? null,
      subscription: sub.data ?? null,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed"
    const status = msg.toLowerCase().includes("unauthorized") ? 401 : 400
    return NextResponse.json({ error: msg }, { status })
  }
}

