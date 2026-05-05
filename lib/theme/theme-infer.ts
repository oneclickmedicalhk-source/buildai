import type { ThemeId, ThemeVariantId } from "@/lib/theme/theme-types"

function normalize(s: string): string {
  return s.toLowerCase()
}

export function inferThemeId(params: {
  userPrompt?: string
  visualThemeKeywords?: string[] | null
}): Exclude<ThemeId, "auto"> {
  const text = normalize(params.userPrompt ?? "")
  const kws = (params.visualThemeKeywords ?? []).map((k) => normalize(k)).join(" ")
  const hay = `${text} ${kws}`.trim()

  // Collectibles / TCG / Pokemon → neon dark
  if (
    /(pokemon|pokémon|tcg|trading card|trading-card|cards|card shop|collectible|collectibles|booster|rarity|holo|foil|deck|arena|tournament)/i.test(
      hay,
    )
  ) {
    return "neon_dark"
  }

  // Aroma / incense / wellness → natural light
  if (
    /(incense|aroma|aromatherapy|essential oil|essential-oil|diffuser|scent|fragrance|candle|candles|spa|wellness|mindful|herbal|botanical|lavender|sage|natural|organic)/i.test(
      hay,
    )
  ) {
    return "natural_light"
  }

  // Default: keep current app vibe (dark modern) unless user hints light/minimal.
  if (/(minimal|clean|white|light|airy|scandi|editorial)/i.test(hay)) {
    return "minimal_light"
  }

  return "studio_dark"
}

export function inferThemeVariantId(params: {
  themeId: Exclude<ThemeId, "auto">
  userPrompt?: string
  visualThemeKeywords?: string[] | null
}): Exclude<ThemeVariantId, "auto"> {
  const text = normalize(params.userPrompt ?? "")
  const kws = (params.visualThemeKeywords ?? []).map((k) => normalize(k)).join(" ")
  const hay = `${text} ${kws}`.trim()

  if (params.themeId === "neon_dark") {
    if (/(holo|foil|shimmer|sparkle|iridescent)/i.test(hay)) return "neon_holo"
    return "neon_glow"
  }
  if (params.themeId === "natural_light") {
    if (/(botanical|herbal|plant|garden|leaf|forest)/i.test(hay)) return "natural_botanical"
    return "natural_paper"
  }
  if (params.themeId === "minimal_light") return "minimal_plain"
  return "studio_spotlight"
}

