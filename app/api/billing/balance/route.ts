import { NextResponse } from "next/server"
import { requireBuildAiUserIdFromRequest } from "@/lib/auth/buildai-supabase-admin"
import { getUserCreditBalanceUsd, maybeGrantFreeMonthlyCredits } from "@/lib/service/credits"

export const runtime = "nodejs"

export async function GET(req: Request) {
  try {
    const userId = await requireBuildAiUserIdFromRequest(req)
    await maybeGrantFreeMonthlyCredits(userId)
    const bal = await getUserCreditBalanceUsd(userId)
    return NextResponse.json(bal)
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unauthorized"
    const status = msg.toLowerCase().includes("unauthorized") ? 401 : 400
    return NextResponse.json({ error: msg }, { status })
  }
}

