import { NextResponse } from "next/server"
import Stripe from "stripe"
import { getStripeServer, getStripeWebhookSecret } from "@/lib/stripe/stripe-server"
import { getBuildAiSupabaseAdmin } from "@/lib/auth/buildai-supabase-admin"
import { insertCreditsLedgerEntry } from "@/lib/service/credits"

export const runtime = "nodejs"

async function readRawBody(req: Request): Promise<Buffer> {
  const arr = new Uint8Array(await req.arrayBuffer())
  return Buffer.from(arr)
}

async function ensureProfilePlan(userId: string, plan: "free" | "pro"): Promise<void> {
  const admin = getBuildAiSupabaseAdmin()
  const res = await admin
    .from("profiles")
    .upsert({ user_id: userId, plan, updated_at: new Date().toISOString() }, { onConflict: "user_id" })
  if (res.error) throw new Error(res.error.message)
}

async function upsertSubscription(params: {
  userId: string
  customerId?: string | null
  subscriptionId?: string | null
  status?: string | null
  currentPeriodEnd?: number | null
}): Promise<void> {
  const admin = getBuildAiSupabaseAdmin()
  const res = await admin.from("subscriptions").upsert(
    {
      user_id: params.userId,
      stripe_customer_id: params.customerId ?? null,
      stripe_subscription_id: params.subscriptionId ?? null,
      status: params.status ?? null,
      current_period_end: params.currentPeriodEnd ? new Date(params.currentPeriodEnd * 1000).toISOString() : null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  )
  if (res.error) throw new Error(res.error.message)
}

async function alreadyProcessedStripeEvent(stripeEventId: string): Promise<boolean> {
  const admin = getBuildAiSupabaseAdmin()
  const res = await admin
    .from("credits_ledger")
    .select("id")
    .eq("meta->>stripe_event_id", stripeEventId)
    .limit(1)
  if (res.error) throw new Error(res.error.message)
  return (res.data?.length ?? 0) > 0
}

async function grantMonthlyCredits(userId: string, amountUsd: number, stripeEventId: string, meta?: Record<string, unknown>) {
  await insertCreditsLedgerEntry({
    userId,
    kind: "monthly_grant",
    amountUsd,
    meta: { stripe_event_id: stripeEventId, ...(meta ?? {}) },
  })
}

async function topupCredits(userId: string, amountUsd: number, stripeEventId: string, meta?: Record<string, unknown>) {
  await insertCreditsLedgerEntry({
    userId,
    kind: "top_up",
    amountUsd,
    meta: { stripe_event_id: stripeEventId, ...(meta ?? {}) },
  })
}

export async function POST(req: Request) {
  const stripe = getStripeServer()
  const secret = getStripeWebhookSecret()

  try {
    const sig = req.headers.get("stripe-signature")
    if (!sig) return NextResponse.json({ error: "Missing stripe-signature" }, { status: 400 })
    const raw = await readRawBody(req)
    const event = stripe.webhooks.constructEvent(raw, sig, secret) as Stripe.Event

    // Idempotency guard for ledger writes.
    const processed = await alreadyProcessedStripeEvent(event.id).catch(() => false)

    if (event.type === "checkout.session.completed") {
      const s = event.data.object as Stripe.Checkout.Session
      const userId = String(s.metadata?.user_id || "")
      const kind = String(s.metadata?.kind || "")
      if (!userId) return NextResponse.json({ ok: true })

      if (!processed && kind === "topup") {
        const topupUsd = Number(s.metadata?.topup_usd || "0")
        const amountUsd = topupUsd > 0 ? topupUsd : (s.amount_total ?? 0) / 100
        if (amountUsd >= 5) {
          await topupCredits(userId, Math.round(amountUsd * 100) / 100, event.id, {
            checkout_session_id: s.id,
          })
        }
      }
      return NextResponse.json({ received: true })
    }

    if (event.type === "customer.subscription.created" || event.type === "customer.subscription.updated") {
      const sub = event.data.object as Stripe.Subscription
      // Try to map to user_id from metadata; fallback to customer metadata.
      let userId = String(sub.metadata?.user_id || "")
      if (!userId && typeof sub.customer === "string") {
        const cust = await stripe.customers.retrieve(sub.customer)
        if (!("deleted" in cust) && cust.metadata?.user_id) userId = String(cust.metadata.user_id)
      }
      if (!userId) return NextResponse.json({ received: true })

      const isActive = sub.status === "active" || sub.status === "trialing"
      await upsertSubscription({
        userId,
        customerId: typeof sub.customer === "string" ? sub.customer : sub.customer?.id ?? null,
        subscriptionId: sub.id,
        status: sub.status,
        currentPeriodEnd: sub.current_period_end ?? null,
      })
      await ensureProfilePlan(userId, isActive ? "pro" : "free")

      return NextResponse.json({ received: true })
    }

    if (event.type === "invoice.paid") {
      const invoice = event.data.object as Stripe.Invoice
      const subId = invoice.subscription ? String(invoice.subscription) : null
      const customerId = invoice.customer ? String(invoice.customer) : null

      // Map user_id: try subscription/customer metadata.
      let userId = ""
      if (subId) {
        const sub = await stripe.subscriptions.retrieve(subId)
        userId = String(sub.metadata?.user_id || "")
        if (!userId && typeof sub.customer === "string") {
          const cust = await stripe.customers.retrieve(sub.customer)
          if (!("deleted" in cust) && cust.metadata?.user_id) userId = String(cust.metadata.user_id)
        }
      }
      if (!userId && customerId) {
        const cust = await stripe.customers.retrieve(customerId)
        if (!("deleted" in cust) && cust.metadata?.user_id) userId = String(cust.metadata.user_id)
      }
      if (!userId) return NextResponse.json({ received: true })

      // Monthly grant: Pro gets $15, Free handled separately (cron later). Here we grant for paid invoices.
      if (!processed) {
        await grantMonthlyCredits(userId, 15, event.id, {
          invoice_id: invoice.id,
          subscription_id: subId,
          kind: "pro_monthly",
        })
      }
      return NextResponse.json({ received: true })
    }

    return NextResponse.json({ received: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Webhook error"
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}

