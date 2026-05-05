"use client"

import Link from "next/link"
import { Header } from "@/components/header"
import { Button } from "@/components/ui/button"
import { Check } from "lucide-react"
import { useI18n } from "@/components/i18n-context"

export default function PricingPage() {
  const { t } = useI18n()
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className="flex-1 max-w-5xl mx-auto px-4 py-12">
        <div className="text-center mb-12">
          <h1 className="text-3xl font-semibold tracking-tight mb-2">{t("pricing_title")}</h1>
          <p className="text-muted-foreground max-w-xl mx-auto">
            {t("pricing_subtitle")}
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="rounded-2xl border border-border bg-card/30 p-6 flex flex-col">
            <h2 className="text-lg font-medium">{t("pricing_free_name")}</h2>
            <p className="mt-2 text-sm text-muted-foreground flex-1">{t("pricing_free_desc")}</p>
            <div className="mt-4 flex items-baseline gap-1">
              <span className="text-3xl font-semibold tabular-nums">{t("pricing_free_price")}</span>
            </div>
            <ul className="mt-6 space-y-2 text-sm">
              {[
                t("pricing_free_desc"),
                "Local preview QA (bundle + runtime gates)",
                "Projects + version history",
                "Export ZIP",
              ].map((f) => (
                <li key={f} className="flex gap-2">
                  <Check className="size-4 shrink-0 text-accent mt-0.5" />
                  <span className="text-muted-foreground">{f}</span>
                </li>
              ))}
            </ul>
            <Button asChild className="mt-8 w-full" variant="outline">
              <Link href="/">{t("pricing_free_cta")}</Link>
            </Button>
          </div>

          <div className="rounded-2xl border border-accent bg-accent/5 shadow-lg p-6 flex flex-col">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-medium">{t("pricing_pro_name")}</h2>
              <span className="text-xs rounded-full bg-accent/15 text-accent px-2 py-0.5">1.5× credits</span>
            </div>
            <p className="mt-2 text-sm text-muted-foreground flex-1">{t("pricing_pro_desc")}</p>
            <div className="mt-4 flex items-baseline gap-1">
              <span className="text-3xl font-semibold tabular-nums">{t("pricing_pro_price")}</span>
              <span className="text-sm text-muted-foreground">{t("pricing_pro_period")}</span>
            </div>
            <ul className="mt-6 space-y-2 text-sm">
              {[
                "Monthly $15 credits",
                "Same token-metered billing",
                "Faster & higher limits (roadmap)",
                "Best for daily usage",
              ].map((f) => (
                <li key={f} className="flex gap-2">
                  <Check className="size-4 shrink-0 text-accent mt-0.5" />
                  <span className="text-muted-foreground">{f}</span>
                </li>
              ))}
            </ul>
            <Button asChild className="mt-8 w-full">
              <Link href="/pricing">{t("pricing_pro_cta")}</Link>
            </Button>
          </div>

          <div className="rounded-2xl border border-border bg-card/30 p-6 flex flex-col">
            <h2 className="text-lg font-medium">{t("pricing_topup_name")}</h2>
            <p className="mt-2 text-sm text-muted-foreground flex-1">{t("pricing_topup_desc")}</p>
            <div className="mt-4 flex items-baseline gap-1">
              <span className="text-3xl font-semibold tabular-nums">{t("pricing_topup_price")}</span>
            </div>
            <ul className="mt-6 space-y-2 text-sm">
              {[
                "Minimum $5 per purchase",
                "No bonus credits",
                "Top up anytime",
                "Instantly available",
              ].map((f) => (
                <li key={f} className="flex gap-2">
                  <Check className="size-4 shrink-0 text-accent mt-0.5" />
                  <span className="text-muted-foreground">{f}</span>
                </li>
              ))}
            </ul>
            <Button asChild className="mt-8 w-full" variant="outline">
              <Link href="/pricing">{t("pricing_topup_cta")}</Link>
            </Button>
          </div>
        </div>

        <div className="mt-12 rounded-2xl border border-border bg-card/30 p-6">
          <h3 className="text-lg font-medium">{t("pricing_faq_title")}</h3>
          <div className="mt-4 space-y-4 text-sm">
            <div>
              <p className="font-medium">{t("pricing_faq_q1")}</p>
              <p className="text-muted-foreground mt-1">{t("pricing_faq_a1")}</p>
            </div>
            <div>
              <p className="font-medium">{t("pricing_faq_q2")}</p>
              <p className="text-muted-foreground mt-1">{t("pricing_faq_a2")}</p>
            </div>
            <div>
              <p className="font-medium">{t("pricing_faq_q3")}</p>
              <p className="text-muted-foreground mt-1">{t("pricing_faq_a3")}</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
