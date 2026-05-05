export type TemplateId =
  | "pokemon_storefront"
  | "incense_storefront"
  | "storefront_admin"
  | "saas_marketing"
  | "analytics_dashboard"

export type TemplatePreset = {
  id: TemplateId
  title: string
  uiStyleKit:
    | "storefront"
    | "storefront_admin"
    | "admin_shell"
    | "saas_marketing"
    | "dashboard_analytics"
  themeId: "auto" | "neon_dark" | "natural_light" | "minimal_light" | "studio_dark"
  prompt: string
}

export const TEMPLATE_PRESETS: TemplatePreset[] = [
  {
    id: "pokemon_storefront",
    title: "Pokemon TCG storefront",
    uiStyleKit: "storefront",
    themeId: "neon_dark",
    prompt:
      "Build a Pokémon trading card ecommerce storefront: home hero + featured sets, catalog grid with rarity badges, product detail (gallery + pricing + add-to-cart), cart with qty controls and empty state. Use on-theme images and neon-dark styling.",
  },
  {
    id: "incense_storefront",
    title: "Incense & aromatherapy shop",
    uiStyleKit: "storefront",
    themeId: "natural_light",
    prompt:
      "Create an incense & aromatherapy ecommerce site: home hero with calm copy, categories (sticks, cones, oils), catalog grid with scent notes, product detail, cart + checkout summary. Natural light theme with soft greens and warm neutrals.",
  },
  {
    id: "storefront_admin",
    title: "Storefront + admin back office",
    uiStyleKit: "storefront_admin",
    themeId: "studio_dark",
    prompt:
      "Build a small DTC shop with a linked admin dashboard: storefront (home, catalog, product, cart) plus admin (products CRUD, orders table). Both surfaces must share the same data model and updates must reflect across views. Include a simple isAdmin toggle for demo role gating.",
  },
  {
    id: "saas_marketing",
    title: "SaaS marketing landing",
    uiStyleKit: "saas_marketing",
    themeId: "studio_dark",
    prompt:
      "Build a B2B SaaS marketing landing page: announcement bar, hero with two CTAs, social proof logos, feature grid, testimonials, pricing table (3 tiers), FAQ accordion, footer. Modern studio-dark theme, emerald accents, responsive and accessible.",
  },
  {
    id: "analytics_dashboard",
    title: "Analytics dashboard",
    uiStyleKit: "dashboard_analytics",
    themeId: "studio_dark",
    prompt:
      "Create an operations analytics dashboard SPA: sidebar + top bar, KPI row (4 metrics), filters, sortable table, secondary chart panel, empty/loading skeleton states. Dense desktop grid on lg+, readable mobile stack.",
  },
]

export function getTemplatePresetById(id: string | null | undefined): TemplatePreset | null {
  if (!id) return null
  return TEMPLATE_PRESETS.find((x) => x.id === id) ?? null
}

