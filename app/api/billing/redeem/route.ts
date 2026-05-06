import { NextResponse } from "next/server"
import { z } from "zod"
import { requireBuildAiUserIdFromRequest, getBuildAiSupabaseAdmin } from "@/lib/auth/buildai-supabase-admin"
import { getUserCreditBalanceUsd, insertCreditsLedgerEntry, maybeGrantFreeMonthlyCredits } from "@/lib/service/credits"

export const runtime = "nodejs"

const redeemSchema = z.object({
  code: z.string().trim().min(1),
})

const PROMO_CODES: Record<string, { amountUsd: number }> = {
  FREE10: { amountUsd: 10 },
}

export async function POST(req: Request) {
  try {
    const userId = await requireBuildAiUserIdFromRequest(req)
    await maybeGrantFreeMonthlyCredits(userId)
    const json: unknown = await req.json()
    const body = redeemSchema.parse(json)
    const code = body.code.toUpperCase()

    const promo = PROMO_CODES[code]
    if (!promo) {
      return NextResponse.json({ error: "Invalid promo code" }, { status: 400 })
    }

    await insertCreditsLedgerEntry({
      userId,
      kind: "promo",
      amountUsd: promo.amountUsd,
      meta: { kind: "promo_code", promo_code: code },
    })

    const bal = await getUserCreditBalanceUsd(userId)
    return NextResponse.json({ ok: true, balanceUsd: bal.balanceUsd })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed"
    const status = msg.toLowerCase().includes("unauthorized") ? 401 : 400
    return NextResponse.json({ error: msg }, { status })
  }
}

