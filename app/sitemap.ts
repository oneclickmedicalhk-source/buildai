import type { MetadataRoute } from "next"

function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "") || "https://example.com"
}

export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl()
  const now = new Date()
  return [
    { url: `${base}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/templates`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${base}/pricing`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${base}/docs`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${base}/settings`, lastModified: now, changeFrequency: "monthly", priority: 0.3 },
  ]
}

