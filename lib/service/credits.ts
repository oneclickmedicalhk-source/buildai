import { getBuildAiSupabaseAdmin } from "@/lib/auth/buildai-supabase-admin"
import crypto from "node:crypto"

export type CreditBalance = {
  balanceUsd: number
}

type UserPlan = "free" | "pro" | string

function monthKeyUtc(ts: number): string {
  const d = new Date(ts)
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, "0")
  return `${y}-${m}`
}

export function currentMonthKeyUtc(): string {
  return monthKeyUtc(Date.now())
}

function toNumber(n: unknown): number {
  if (typeof n === "number") return n
  if (typeof n === "string" && n.trim()) return Number(n)
  return 0
}

export async function getUserPlan(userId: string): Promise<UserPlan> {
  const admin = getBuildAiSupabaseAdmin()
  const prof = await admin.from("profiles").select("plan").eq("user_id", userId).maybeSingle()
  if (prof.error) throw new Error(prof.error.message)
  return String((prof.data as any)?.plan ?? "free")
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

  const plan = await getUserPlan(userId)
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

export async function canUseFreeFirstBuildWaiver(userId: string): Promise<boolean> {
  const plan = await getUserPlan(userId)
  if (plan !== "free") return false
  const admin = getBuildAiSupabaseAdmin()
  const key = currentMonthKeyUtc()
  const used = await admin
    .from("credits_ledger")
    .select("id")
    .eq("user_id", userId)
    .eq("kind", "refund")
    .eq("meta->>kind", "free_first_build_waiver")
    .eq("meta->>month", key)
    .limit(1)
  if (used.error) throw new Error(used.error.message)
  return (used.data?.length ?? 0) === 0
}

export async function applyFreeFirstBuildCap(params: {
  userId: string
  phase: "plan" | "generate"
  chargedUsd: number
  capUsd?: number
}): Promise<{ finalChargedUsd: number; discountUsd: number }> {
  const cap = Math.max(0, params.capUsd ?? 3)
  if (cap <= 0) return { finalChargedUsd: params.chargedUsd, discountUsd: 0 }
  const plan = await getUserPlan(params.userId)
  if (plan !== "free") return { finalChargedUsd: params.chargedUsd, discountUsd: 0 }

  const admin = getBuildAiSupabaseAdmin()
  const key = currentMonthKeyUtc()

  // Mark waiver as consumed for this month (even if discount ends up being 0).
  const marker = await admin
    .from("credits_ledger")
    .select("id")
    .eq("user_id", params.userId)
    .eq("kind", "refund")
    .eq("meta->>kind", "free_first_build_waiver")
    .eq("meta->>month", key)
    .limit(1)
  if (marker.error) throw new Error(marker.error.message)
  if ((marker.data?.length ?? 0) === 0) {
    await insertCreditsLedgerEntry({
      userId: params.userId,
      kind: "refund",
      amountUsd: 0,
      meta: { kind: "free_first_build_waiver", month: key },
    })
  }

  // How much has already been charged (net) for the first build this month?
  const chargedRows = await admin
    .from("credits_ledger")
    .select("amount_usd")
    .eq("user_id", params.userId)
    .eq("kind", "usage_charge")
    .eq("meta->>kind", "first_build")
    .eq("meta->>month", key)
  if (chargedRows.error) throw new Error(chargedRows.error.message)
  const alreadyChargedUsd = Math.abs(
    (chargedRows.data ?? []).reduce((sum, r) => sum + toNumber(r.amount_usd), 0),
  )

  const remaining = Math.max(0, Math.round((cap - alreadyChargedUsd) * 100) / 100)
  const finalChargedUsd = Math.min(params.chargedUsd, remaining)
  const discountUsd = Math.max(0, Math.round((params.chargedUsd - finalChargedUsd) * 100) / 100)

  // Mark waiver usage (once per month) when a discount is applied.
  if (discountUsd > 0) {
    await insertCreditsLedgerEntry({
      userId: params.userId,
      kind: "refund",
      amountUsd: discountUsd,
      meta: {
        kind: "promo_first_build",
        month: key,
        phase: params.phase,
        capUsd: cap,
        originalChargedUsd: params.chargedUsd,
      },
    })
  }

  return { finalChargedUsd, discountUsd }
}

export async function insertCreditsLedgerEntry(params: {
  userId: string
  kind: "monthly_grant" | "top_up" | "refund" | "usage_charge" | "promo"
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

export async function insertCreditsLedgerEntriesSplit(params: {
  userId: string
  kind: "usage_charge"
  /** Positive USD amount to be charged; this helper will insert negative ledger rows. */
  totalChargeUsd: number
  /** Optional split step. Defaults to $1.00. */
  splitUsd?: number
  meta?: Record<string, unknown>
  /** Optional request id used to correlate multiple rows. */
  requestId?: string
}): Promise<{ requestId: string; parts: number }> {
  const total = Math.max(0, Math.round(params.totalChargeUsd * 100) / 100)
  if (total <= 0) {
    return { requestId: params.requestId ?? crypto.randomUUID(), parts: 0 }
  }

  const step = Math.max(0.01, Math.round((params.splitUsd ?? 1) * 100) / 100)
  const requestId = params.requestId ?? crypto.randomUUID()

  const parts: number[] = []
  let remaining = total
  while (remaining > 0) {
    const part = Math.min(step, remaining)
    // Keep cents consistent.
    const rounded = Math.round(part * 100) / 100
    parts.push(rounded)
    remaining = Math.round((remaining - rounded) * 100) / 100
    // Safety guard against floating loops.
    if (parts.length > 200) break
  }

  const admin = getBuildAiSupabaseAdmin()
  const rows = parts.map((p, idx) => ({
    user_id: params.userId,
    ts: Date.now(),
    kind: params.kind,
    amount_usd: -p,
    meta: {
      ...(params.meta ?? {}),
      request_id: requestId,
      part_index: idx + 1,
      parts_total: parts.length,
    },
  }))
  const res = await admin.from("credits_ledger").insert(rows)
  if (res.error) throw new Error(res.error.message)
  return { requestId, parts: parts.length }
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

