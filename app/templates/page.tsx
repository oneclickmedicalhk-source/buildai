"use client"

import Link from "next/link"
import { Header } from "@/components/header"
import { Button } from "@/components/ui/button"
import { useI18n } from "@/components/i18n-context"

type Preset = {
  id: string
  title: string
  description: string
  uiStyleKit:
    | "storefront"
    | "storefront_admin"
    | "admin_shell"
    | "saas_marketing"
    | "dashboard_analytics"
  themeId: "auto" | "neon_dark" | "natural_light" | "minimal_light" | "studio_dark"
  prompt: string
}

const PRESETS: Preset[] = [
  {
    id: "pokemon_storefront",
    title: "Pokemon TCG storefront",
    description: "Dark neon, image-forward product grid, rarity badges, cart.",
    uiStyleKit: "storefront",
    themeId: "neon_dark",
    prompt:
      "Build a Pokémon trading card ecommerce storefront: home hero + featured sets, catalog grid with rarity badges, product detail (gallery + pricing + add-to-cart), cart with qty controls and empty state. Use on-theme images and neon-dark styling.",
  },
  {
    id: "incense_storefront",
    title: "Incense & aromatherapy shop",
    description: "Natural light palette, calm typography, warm surfaces.",
    uiStyleKit: "storefront",
    themeId: "natural_light",
    prompt:
      "Create an incense & aromatherapy ecommerce site: home hero with calm copy, categories (sticks, cones, oils), catalog grid with scent notes, product detail, cart + checkout summary. Natural light theme with soft greens and warm neutrals.",
  },
  {
    id: "storefront_admin",
    title: "Storefront + admin back office",
    description: "One app: shop + role-gated admin CRUD with shared data.",
    uiStyleKit: "storefront_admin",
    themeId: "studio_dark",
    prompt:
      "Build a small DTC shop with a linked admin dashboard: storefront (home, catalog, product, cart) plus admin (products CRUD, orders table). Both surfaces must share the same data model and updates must reflect across views. Include a simple isAdmin toggle for demo role gating.",
  },
  {
    id: "saas_marketing",
    title: "SaaS marketing landing",
    description: "Hero + social proof + pricing + FAQ with consistent components.",
    uiStyleKit: "saas_marketing",
    themeId: "studio_dark",
    prompt:
      "Build a B2B SaaS marketing landing page: announcement bar, hero with two CTAs, social proof logos, feature grid, testimonials, pricing table (3 tiers), FAQ accordion, footer. Modern studio-dark theme, emerald accents, responsive and accessible.",
  },
  {
    id: "analytics_dashboard",
    title: "Analytics dashboard",
    description: "KPI row + filters + table + chart, dense desktop layout.",
    uiStyleKit: "dashboard_analytics",
    themeId: "studio_dark",
    prompt:
      "Create an operations analytics dashboard SPA: sidebar + top bar, KPI row (4 metrics), filters, sortable table, secondary chart panel, empty/loading skeleton states. Dense desktop grid on lg+, readable mobile stack.",
  },
]

export default function TemplatesPage() {
  const { lang, t } = useI18n()
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className="flex-1 max-w-5xl mx-auto px-4 py-12 space-y-10">
        <div className="text-center">
          <h1 className="text-3xl font-semibold tracking-tight mb-2">{lang === "zh-HK" ? "範本" : "Templates"}</h1>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            {lang === "zh-HK" ? (
              <>
                一鍵起手式：會幫你預先設定 <strong className="text-foreground">介面框架</strong> +{" "}
                <strong className="text-foreground">主題</strong>，令唔同類型項目（例如 Pokemon vs 香薰）風格更明顯（更似 v0）。
              </>
            ) : (
              <>
                Quick starters that set <strong className="text-foreground">UI pattern</strong> +{" "}
                <strong className="text-foreground">Theme</strong> so different niches look meaningfully different (v0-style).
              </>
            )}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {PRESETS.map((p) => (
            <div key={p.title} className="rounded-2xl border border-border bg-card/30 p-6 flex flex-col">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-lg font-medium">{p.title}</h2>
                  <p className="text-sm text-muted-foreground mt-1">{p.description}</p>
                </div>
              </div>
              <div className="mt-4 text-xs text-muted-foreground">
                <div className="flex flex-wrap gap-2">
                  <span className="rounded-md border border-border px-2 py-1">
                    UI: <span className="text-foreground">{p.uiStyleKit}</span>
                  </span>
                  <span className="rounded-md border border-border px-2 py-1">
                    Theme: <span className="text-foreground">{p.themeId}</span>
                  </span>
                </div>
              </div>
              <p className="mt-4 text-xs text-muted-foreground leading-relaxed line-clamp-5">{p.prompt}</p>
              <div className="mt-6 flex items-center gap-2">
                <Button asChild>
                  <Link
                    href={`/?preset=1&presetId=${encodeURIComponent(p.id)}&uiStyleKit=${encodeURIComponent(
                      p.uiStyleKit,
                    )}&themeId=${encodeURIComponent(p.themeId)}&prompt=${encodeURIComponent(p.prompt)}`}
                  >
                    {t("templates_use")}
                  </Link>
                </Button>
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-center pt-2">
          <Button asChild variant="outline" className="h-9">
            <Link href="/">{t("templates_back")}</Link>
          </Button>
        </div>
      </main>
    </div>
  )
}

