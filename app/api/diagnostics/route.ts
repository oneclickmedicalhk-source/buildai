import { NextResponse } from "next/server"

export const runtime = "nodejs"

/**
 * Lightweight server-side checks (no secrets leaked). Use with /diagnostics page from the browser.
 */
export async function GET() {
  const hasSupabasePublic =
    Boolean(process.env.NEXT_PUBLIC_BUILDAI_SUPABASE_URL?.trim()) &&
    Boolean(process.env.NEXT_PUBLIC_BUILDAI_SUPABASE_ANON_KEY?.trim())
  const hasSupabaseService = Boolean(process.env.BUILDAI_SUPABASE_SERVICE_ROLE_KEY?.trim())
  const siteUrl = Boolean(process.env.NEXT_PUBLIC_SITE_URL?.trim())
  const hasStripe = Boolean(process.env.STRIPE_SECRET_KEY?.trim())
  const hasAi =
    Boolean(process.env.OPENAI_API_KEY?.trim()) ||
    Boolean(process.env.GOOGLE_API_KEY?.trim()) ||
    Boolean(process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim()) ||
    Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim())
  const hasSupabaseMgmtOAuth =
    Boolean(process.env.SUPABASE_OAUTH_CLIENT_ID?.trim()) &&
    Boolean(process.env.SUPABASE_OAUTH_CLIENT_SECRET?.trim())
  const hasGithubPublishOAuth =
    Boolean(process.env.GITHUB_CLIENT_ID?.trim()) && Boolean(process.env.GITHUB_CLIENT_SECRET?.trim())
  const hasVercelPublishOAuth =
    Boolean(process.env.VERCEL_CLIENT_ID?.trim()) && Boolean(process.env.VERCEL_CLIENT_SECRET?.trim())
  const hasPublishCookieSecret = Boolean(process.env.PUBLISH_COOKIE_SECRET?.trim())

  return NextResponse.json({
    ok: true,
    node: process.version,
    envConfigured: {
      nextPublicSiteUrl: siteUrl,
      supabaseBrowser: hasSupabasePublic,
      supabaseServiceRole: hasSupabaseService,
      stripe: hasStripe,
      ai: hasAi,
      supabaseManagementOAuth: hasSupabaseMgmtOAuth,
      /** Publish → GitHub OAuth (`/api/oauth/github/*`) */
      githubPublishOAuth: hasGithubPublishOAuth,
      /** Publish → Vercel OAuth (`/api/oauth/vercel/*`) */
      vercelPublishOAuth: hasVercelPublishOAuth,
      /** Encrypt GitHub/Vercel tokens in cookies — required after OAuth callback */
      publishCookieSecret: hasPublishCookieSecret,
    },
  })
}
