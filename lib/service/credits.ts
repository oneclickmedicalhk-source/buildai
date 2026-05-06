import { getBuildAiSupabaseAdmin } from "@/lib/auth/buildai-supabase-admin"

export type CreditBalance = {
  balanceUsd: number
}

function monthKeyUtc(ts: number): string {
  const d = new Date(ts)
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, "0")
  return `${y}-${m}`
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

/**
 * Free plan monthly credits (testing): user gets up to $10/month, but cannot accumulate.
 * Implementation: per month, top up the user's current balance to $10 (if below),
 * otherwise grant nothing. This ensures "at most $10" for free monthly credits.
 */
export async function maybeGrantFreeMonthlyCredits(userId: string): Promise<void> {
  const admin = getBuildAiSupabaseAdmin()

  const prof = await admin.from("profiles").select("plan").eq("user_id", userId).maybeSingle()
  if (prof.error) throw new Error(prof.error.message)
  const plan = String((prof.data as any)?.plan ?? "free")
  if (plan !== "free") return

  const key = monthKeyUtc(Date.now())
  const grants = await admin
    .from("credits_ledger")
    .select("amount_usd")
    .eq("user_id", userId)
    .eq("kind", "monthly_grant")
    .eq("meta->>kind", "free_monthly")
    .eq("meta->>month", key)
  if (grants.error) throw new Error(grants.error.message)
  const grantedThisMonthUsd = (grants.data ?? []).reduce((sum, r) => sum + toNumber(r.amount_usd), 0)

  const bal = await getUserCreditBalanceUsd(userId)
  const target = 10
  const delta = Math.round((target - bal.balanceUsd) * 100) / 100
  if (delta <= 0) return
  // If we already granted at least target this month, do nothing.
  if (grantedThisMonthUsd >= target) return

  await insertCreditsLedgerEntry({
    userId,
    kind: "monthly_grant",
    amountUsd: delta,
    meta: { kind: "free_monthly", month: key },
  })
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

