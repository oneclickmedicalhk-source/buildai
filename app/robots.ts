import type { MetadataRoute } from "next"

function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "") || "https://example.com"
}

export default function robots(): MetadataRoute.Robots {
  const base = siteUrl()
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/auth/", "/login", "/settings", "/diagnostics"],
    },
    sitemap: `${base}/sitemap.xml`,
    host: base,
  }
}

