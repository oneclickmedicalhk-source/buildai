import { NextResponse } from "next/server"

export const runtime = "nodejs"

/**
 * OAuth callback (skeleton). Validates state + exchanges code when implemented.
 */
export async function GET(): Promise<NextResponse> {
  return NextResponse.json(
    {
      status: "not_implemented",
      message:
        "Supabase OAuth callback is not wired. See docs/integrations-oauth-roadmap.md for the intended flow.",
    },
    { status: 501 },
  )
}
