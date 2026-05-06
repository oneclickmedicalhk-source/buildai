import { NextResponse } from "next/server"
import { getBuildAiSupabaseAdmin } from "@/lib/auth/buildai-supabase-admin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Server-side DB permission sanity check (no secrets, no auth required).
 * Useful to distinguish "wrong service_role key / not applied" vs "table/RLS/grants".
 */
export async function GET() {
  try {
    const admin = getBuildAiSupabaseAdmin()
    const res = await admin.from("profiles").select("user_id").limit(1)
    if (res.error) {
      return NextResponse.json(
        {
          ok: false,
          step: "select profiles",
          error: res.error.message,
          hint:
            "If this says permission denied, your BUILDAI_SUPABASE_SERVICE_ROLE_KEY is wrong or the role lacks privileges. Ensure you used the service_role key for the same Supabase project and redeployed Vercel.",
        },
        { status: 200, headers: { "Cache-Control": "no-store, max-age=0" } },
      )
    }
    return NextResponse.json(
      { ok: true, profilesReadable: true },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    )
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed"
    return NextResponse.json(
      { ok: false, step: "init admin client", error: msg },
      { status: 200, headers: { "Cache-Control": "no-store, max-age=0" } },
    )
  }
}

