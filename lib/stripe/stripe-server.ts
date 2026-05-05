import Stripe from "stripe"

let cached: Stripe | null = null

function mustEnv(name: string): string {
  const v = process.env[name]
  if (!v?.trim()) throw new Error(`Missing ${name}`)
  return v
}

export function getStripeServer(): Stripe {
  if (cached) return cached
  const key = mustEnv("STRIPE_SECRET_KEY")
  cached = new Stripe(key, { apiVersion: "2025-02-24.acacia" })
  return cached
}

export function getStripeWebhookSecret(): string {
  return mustEnv("STRIPE_WEBHOOK_SECRET")
}

