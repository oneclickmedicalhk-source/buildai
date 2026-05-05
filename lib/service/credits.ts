import { getBuildAiSupabaseAdmin } from "@/lib/auth/buildai-supabase-admin"

export type CreditBalance = {
  balanceUsd: number
}

function toNumber(n: unknown): number {
  if (typeof n === "number") return n
  if (typeof n === "string" && n.trim()) return Number(n)
  return 0
}

export async function getUserCreditBalanceUsd(userId: string): Promise<CreditBalance> {
  const admin = getBuildAiSupabaseAdmin()
  const res = await admin
    .from("credits_ledger")
    .select("amount_usd")
    .eq("user_id", userId)
  if (res.error) throw new Error(res.error.message)
  const balanceUsd = (res.data ?? []).reduce((sum, r) => sum + toNumber(r.amount_usd), 0)
  return { balanceUsd: Math.round(balanceUsd * 100) / 100 }
}

export async function insertCreditsLedgerEntry(params: {
  userId: string
  kind: "monthly_grant" | "top_up" | "refund" | "usage_charge"
  amountUsd: number
  meta?: Record<string, unknown>
}): Promise<void> {
  const admin = getBuildAiSupabaseAdmin()
  const res = await admin.from("credits_ledger").insert({
    user_id: params.userId,
    ts: Date.now(),
    kind: params.kind,
    amount_usd: params.amountUsd,
    meta: params.meta ?? {},
  })
  if (res.error) throw new Error(res.error.message)
}

export async function insertUsageEvent(params: {
  userId: string
  provider: string
  model: string
  inputTokens: number
  outputTokens: number
  costUsd: number
  chargedUsd: number
  requestId?: string
  meta?: Record<string, unknown>
}): Promise<void> {
  const admin = getBuildAiSupabaseAdmin()
  const res = await admin.from("usage_events").insert({
    user_id: params.userId,
    ts: Date.now(),
    provider: params.provider,
    model: params.model,
    input_tokens: params.inputTokens,
    output_tokens: params.outputTokens,
    cost_usd: params.costUsd,
    charged_usd: params.chargedUsd,
    request_id: params.requestId ?? null,
    meta: params.meta ?? {},
  })
  if (res.error) throw new Error(res.error.message)
}

