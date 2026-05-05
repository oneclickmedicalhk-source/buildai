import { NextResponse } from "next/server"
import { z } from "zod"
import { requireBuildAiUserIdFromRequest } from "@/lib/auth/buildai-supabase-admin"
import { getStripeServer } from "@/lib/stripe/stripe-server"
import { getBuildAiSupabaseAdmin } from "@/lib/auth/buildai-supabase-admin"

export const runtime = "nodejs"

const bodySchema = z.object({
  kind: z.enum(["subscription_pro", "topup"]),
  topupAmountUsd: z.number().min(5).max(500).optional(),
})

function mustEnv(name: string): string {
  const v = process.env[name]
  if (!v?.trim()) throw new Error(`Missing ${name}`)
  return v
}

async function getOrCreateStripeCustomerId(userId: string): Promise<string> {
  const admin = getBuildAiSupabaseAdmin()
  const sub = await admin.from("subscriptions").select("stripe_customer_id").eq("user_id", userId).maybeSingle()
  if (sub.error) throw new Error(sub.error.message)
  const existing = sub.data?.stripe_customer_id
  if (existing?.trim()) return existing

  const stripe = getStripeServer()
  const customer = await stripe.customers.create({ metadata: { user_id: userId } })

  const up = await admin.from("subscriptions").upsert(
    { user_id: userId, stripe_customer_id: customer.id, updated_at: new Date().toISOString() },
    { onConflict: "user_id" },
  )
  if (up.error) throw new Error(up.error.message)
  return customer.id
}

export async function POST(req: Request) {
  try {
    const userId = await requireBuildAiUserIdFromRequest(req)
    const raw: unknown = await req.json()
    const body = bodySchema.parse(raw)

    const stripe = getStripeServer()
    const customerId = await getOrCreateStripeCustomerId(userId)
    const origin = req.headers.get("origin") || "http://localhost:3000"

    if (body.kind === "subscription_pro") {
      const priceId = mustEnv("STRIPE_PRICE_PRO_MONTHLY")
      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        customer: customerId,
        line_items: [{ price: priceId, quantity: 1 }],
        allow_promotion_codes: false,
        success_url: `${origin}/settings?billing=success`,
        cancel_url: `${origin}/settings?billing=cancel`,
        metadata: { user_id: userId, kind: "subscription_pro" },
      })
      return NextResponse.json({ url: session.url })
    }

    const amountUsd = body.topupAmountUsd ?? 5
    const cents = Math.round(amountUsd * 100)
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer: customerId,
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: { name: "BuildAI credits top up" },
            unit_amount: cents,
          },
          quantity: 1,
        },
      ],
      success_url: `${origin}/settings?topup=success`,
      cancel_url: `${origin}/settings?topup=cancel`,
      metadata: { user_id: userId, kind: "topup", topup_usd: String(amountUsd) },
    })
    return NextResponse.json({ url: session.url })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Checkout failed"
    const status = msg.toLowerCase().includes("unauthorized") ? 401 : 400
    return NextResponse.json({ error: msg }, { status })
  }
}

