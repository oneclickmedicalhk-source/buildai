import { NextResponse } from "next/server"

export const runtime = "nodejs"

/**
 * OAuth entry point (skeleton). Full flow: see docs/integrations-oauth-roadmap.md
 */
export async function GET(): Promise<NextResponse> {
  return NextResponse.json(
    {
      status: "not_implemented",
      message:
        "Supabase OAuth is not enabled yet. Use Integrations → paste Project URL + anon key, or read docs/integrations-oauth-roadmap.md.",
    },
    { status: 501 },
  )
}
