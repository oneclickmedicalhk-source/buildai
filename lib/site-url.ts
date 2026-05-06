/**
 * Public site base URL for redirects (OAuth, emails, SEO).
 * Prefer NEXT_PUBLIC_SITE_URL in production to avoid wrong host behind proxies.
 */
export function resolvePublicSiteUrl(requestUrl: string): string {
  const trimmed = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "")
  if (trimmed) return trimmed
  const u = new URL(requestUrl)
  return `${u.protocol}//${u.host}`
}
