/**
 * Optional UI “framework” presets appended to codegen/plan system prompts so builds stay
 * visually consistent (Tailwind, modern density) without hardcoding one admin template everywhere.
 */
import { z } from "zod"

export const uiStyleKitSchema = z.enum([
  "default",
  "admin_shell",
  "storefront",
  "storefront_admin",
  "saas_marketing",
  "dashboard_analytics",
])

export type UiStyleKitId = z.infer<typeof uiStyleKitSchema>

export function buildCodegenUiStyleKitSection(kit: UiStyleKitId): string {
  if (kit === "default") return ""

  if (kit === "admin_shell") {
    return `
### UI STYLE KIT: admin_shell (mandatory — reuse this shell pattern)
- **Shell**: Fixed **left sidebar** (w-56–64, collapsible on mobile behind a menu button), **top bar** (title/breadcrumb, optional search slot, user/avatar area), **main** scroll area. Same shell across every view; only main content swaps.
- **Surfaces**: Dense desktop table/grid; \`rounded-xl\` or \`rounded-2xl\` cards, \`border border-zinc-800/80\`, subtle \`shadow\`; KPI row + filters row + primary content.
- **Density**: On \`lg+\`, prefer multi-column layouts and compact typography; keep touch targets \`min-h-10\` on primary actions.
- **Do not** invent a new layout system per screen — **reuse** the same sidebar width, top bar height, and content max width (\`max-w-7xl mx-auto px-4\` in main).
`
  }

  if (kit === "storefront_admin") {
    return `
### UI STYLE KIT: storefront_admin (mandatory — one app, two surfaces)
- Build **one SPA** with a **shared data model** (products, customers, orders) and two surfaces:
  - **Storefront**: top nav + cart badge + product grid + product detail + cart/checkout.
  - **Admin**: an admin shell (sidebar + top bar) with CRUD tables/forms for products/orders.
- **Linking rule**: storefront and admin MUST operate on the **same state + services**. Do not create two unrelated datasets.
- **Access rule**: admin views must be role-gated (simple local demo: \`isAdmin\` toggle in user menu; Supabase build: role claim / allowlist).
- Keep styling consistent across both: shared spacing scale, button variants, card surfaces.
`
  }

  if (kit === "saas_marketing") {
    return `
### UI STYLE KIT: saas_marketing (mandatory — landing-page consistency)
- **Page structure**: announcement bar (optional) → hero (headline + subcopy + 2 CTAs) → social proof logos → feature grid (3–6) → testimonial strip → pricing (3 tiers) → FAQ accordion → footer.
- **Reusable components**: button variants, pill badges, feature cards with icons, pricing cards with a “Most popular” highlight.
- **Typography**: one clear type scale (xs/sm/base/lg/2xl/3xl) with consistent leading; avoid random sizes.
- **Layout**: \`max-w-6xl mx-auto px-4 md:px-6\` sections, \`py-10 md:py-14\`, grids that step up at \`sm/md/lg\`.
`
  }

  if (kit === "dashboard_analytics") {
    return `
### UI STYLE KIT: dashboard_analytics (mandatory — consistent dashboard shell)
- **Shell**: sidebar + top bar; main content uses a dense grid on desktop (\`lg:grid-cols-12\`) and stacks on mobile.
- **Default blocks**: KPI row (4 cards), filters row, primary table, secondary chart panel; always include empty/loading states.
- **Component consistency**: same table row height, same filter chip/button styling, same card padding across all views.
`
  }

  return `
### UI STYLE KIT: storefront (mandatory — reuse this storefront pattern)
- **Shell**: **Top nav** (logo, category links, cart icon with badge), optional **sticky** announcement bar. **Footer** with columns (shop, help, legal placeholders).
- **Home**: Hero + featured categories + responsive **product grid** (sm:2 md:3 lg:4).
- **Product cards**: Image, title, price, optional badge; consistent card height and image aspect (e.g. \`aspect-[4/3]\`).
- **Cart**: Line items, qty controls, empty cart state, totals — same nav/footer as other views.
- Stay on-theme with \`plan.visualThemeKeywords\` or the user’s described niche for demo copy and images.
`
}

export function buildPlanUiStyleKitHint(kit: UiStyleKitId): string {
  if (kit === "default") return ""
  if (kit === "admin_shell") {
    return `\n- **UI style kit**: admin_shell — plan for a **persistent admin shell** (sidebar + top bar + main); informationArchitecture views should map to the **same shell** (swap main only). buildTodos must mention the shared shell once.`
  }
  if (kit === "storefront_admin") {
    return `\n- **UI style kit**: storefront_admin — plan for one SPA with both **storefront + admin** surfaces. Views must include store pages (home/catalog/product/cart) plus admin pages (admin_dashboard/products/orders). Include role-gating in buildTodos and ensure both surfaces share the same entities/services.`
  }
  if (kit === "saas_marketing") {
    return `\n- **UI style kit**: saas_marketing — plan a marketing landing page with consistent sections (hero, social proof, features, pricing, FAQ, footer) and reusable card/button components.`
  }
  if (kit === "dashboard_analytics") {
    return `\n- **UI style kit**: dashboard_analytics — plan a dashboard shell with sidebar+topbar, KPI row, filters, primary table/chart, and empty/loading states.`
  }
  return `\n- **UI style kit**: storefront — plan for **shop shell** (header nav + footer + cart); views should include home, catalog/browse, product detail, cart at minimum unless the user scope differs.`
}
