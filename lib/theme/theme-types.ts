import { z } from "zod"

export const themeIdSchema = z.enum([
  "auto",
  "neon_dark",
  "natural_light",
  "minimal_light",
  "studio_dark",
])

export type ThemeId = z.infer<typeof themeIdSchema>

export type ThemeVariantId =
  | "auto"
  | "neon_glow"
  | "neon_holo"
  | "natural_paper"
  | "natural_botanical"
  | "studio_spotlight"
  | "minimal_plain"

export type ThemeTokens = {
  id: Exclude<ThemeId, "auto">
  variantId?: Exclude<ThemeVariantId, "auto">
  label: string
  /**
   * Tailwind classes the model should apply at the app root
   * (e.g. outermost container on body-level background).
   */
  appBgClass: string
  /** Surface/card background and border treatment. */
  surfaceClass: string
  /** Primary accent (buttons, links). */
  accentClass: string
  /** Secondary accent/hint. */
  accentSoftClass: string
  /** Typography mood hint. */
  typographyHint: string
  /** Optional background flourish guidance (safe, non-layout). */
  backgroundHint: string
}

export const THEME_TOKENS: Record<Exclude<ThemeId, "auto">, ThemeTokens> = {
  neon_dark: {
    id: "neon_dark",
    variantId: "neon_glow",
    label: "Neon dark",
    appBgClass:
      "bg-zinc-950 text-zinc-100 [background:radial-gradient(1200px_circle_at_20%_-10%,rgba(34,197,94,0.18),transparent_55%),radial-gradient(900px_circle_at_90%_0%,rgba(34,211,238,0.14),transparent_52%),linear-gradient(to_bottom,rgba(0,0,0,0.0),rgba(0,0,0,0.0))]",
    surfaceClass: "bg-zinc-900/50 border border-zinc-800/80 shadow-[0_0_0_1px_rgba(255,255,255,0.04)]",
    accentClass: "bg-emerald-500 text-emerald-950 hover:bg-emerald-400",
    accentSoftClass: "text-emerald-400",
    typographyHint: "Slightly punchy headings, compact body text, high contrast.",
    backgroundHint: "Subtle neon glow accents; avoid heavy gradients inside cards.",
  },
  natural_light: {
    id: "natural_light",
    variantId: "natural_paper",
    label: "Natural light",
    appBgClass:
      "bg-amber-50 text-zinc-900 [background:radial-gradient(900px_circle_at_20%_0%,rgba(16,185,129,0.18),transparent_60%),radial-gradient(900px_circle_at_90%_-10%,rgba(245,158,11,0.15),transparent_55%)]",
    surfaceClass: "bg-white/80 border border-amber-200/80 shadow-sm",
    accentClass: "bg-emerald-600 text-white hover:bg-emerald-500",
    accentSoftClass: "text-emerald-700",
    typographyHint: "Calm, airy typography; more whitespace on hero sections; softer contrast.",
    backgroundHint: "Use warm neutrals; prefer light surfaces and gentle shadows.",
  },
  minimal_light: {
    id: "minimal_light",
    variantId: "minimal_plain",
    label: "Minimal light",
    appBgClass: "bg-white text-zinc-900",
    surfaceClass: "bg-white border border-zinc-200 shadow-sm",
    accentClass: "bg-zinc-900 text-white hover:bg-zinc-800",
    accentSoftClass: "text-zinc-900",
    typographyHint: "Minimal, editorial feel; keep decoration low and layout clean.",
    backgroundHint: "No gradients by default; rely on spacing and typography.",
  },
  studio_dark: {
    id: "studio_dark",
    variantId: "studio_spotlight",
    label: "Studio dark",
    appBgClass:
      "bg-zinc-950 text-zinc-100 [background:radial-gradient(1000px_circle_at_50%_-20%,rgba(255,255,255,0.08),transparent_55%)]",
    surfaceClass: "bg-zinc-900/40 border border-zinc-800 shadow-lg",
    accentClass: "bg-indigo-500 text-white hover:bg-indigo-400",
    accentSoftClass: "text-indigo-300",
    typographyHint: "Sleek, product-studio vibe; strong hierarchy; crisp dividers.",
    backgroundHint: "Use soft spotlights and subtle noise-like texture sparingly.",
  },
}

export const THEME_VARIANTS: Record<
  Exclude<ThemeVariantId, "auto">,
  {
    id: Exclude<ThemeVariantId, "auto">
    label: string
    /** Optional override for `appBgClass` (keeps palette but changes texture). */
    appBgClass?: string
    backgroundHint: string
  }
> = {
  neon_glow: {
    id: "neon_glow",
    label: "Neon glow",
    backgroundHint: "Neon glow corners; keep surfaces clean and readable.",
  },
  neon_holo: {
    id: "neon_holo",
    label: "Holo foil",
    appBgClass:
      "bg-zinc-950 text-zinc-100 [background:radial-gradient(900px_circle_at_10%_0%,rgba(34,197,94,0.20),transparent_55%),radial-gradient(900px_circle_at_90%_-10%,rgba(59,130,246,0.18),transparent_55%),radial-gradient(900px_circle_at_50%_110%,rgba(236,72,153,0.12),transparent_55%)]",
    backgroundHint: "Holographic vibe: multi-color soft glows, subtle shimmer accents on badges (not everywhere).",
  },
  natural_paper: {
    id: "natural_paper",
    label: "Paper",
    appBgClass:
      "bg-amber-50 text-zinc-900 [background:radial-gradient(900px_circle_at_20%_0%,rgba(16,185,129,0.16),transparent_60%),radial-gradient(900px_circle_at_90%_-10%,rgba(245,158,11,0.12),transparent_55%),linear-gradient(to_bottom,rgba(255,255,255,0.65),rgba(255,255,255,0.35))]",
    backgroundHint: "Paper-like calm: warm background, gentle gradients; avoid harsh contrasts.",
  },
  natural_botanical: {
    id: "natural_botanical",
    label: "Botanical",
    appBgClass:
      "bg-emerald-50 text-zinc-900 [background:radial-gradient(900px_circle_at_15%_0%,rgba(16,185,129,0.18),transparent_60%),radial-gradient(900px_circle_at_85%_-10%,rgba(34,197,94,0.16),transparent_55%)]",
    backgroundHint: "Botanical: soft greens, airy whitespace, organic feel; keep cards light and rounded.",
  },
  studio_spotlight: {
    id: "studio_spotlight",
    label: "Spotlight",
    backgroundHint: "Studio spotlight: subtle top glow + crisp dividers; professional vibe.",
  },
  minimal_plain: {
    id: "minimal_plain",
    label: "Plain",
    backgroundHint: "Minimal: no gradients; rely on spacing + typography; subtle borders only.",
  },
}

export function resolveThemeTokens(params: {
  themeId: ThemeId
  variantId?: ThemeVariantId | null
}): ThemeTokens {
  const base = THEME_TOKENS[params.themeId === "auto" ? "studio_dark" : params.themeId]
  const v = params.variantId && params.variantId !== "auto" ? THEME_VARIANTS[params.variantId] : undefined
  if (!v) return base
  return {
    ...base,
    variantId: v.id,
    ...(v.appBgClass ? { appBgClass: v.appBgClass } : {}),
    backgroundHint: `${base.backgroundHint} ${v.backgroundHint}`.trim(),
  }
}

