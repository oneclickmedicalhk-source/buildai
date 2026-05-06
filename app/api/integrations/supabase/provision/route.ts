import { NextResponse } from "next/server"
import crypto from "node:crypto"
import { requireBuildAiUserIdFromRequest, getBuildAiSupabaseAdmin } from "@/lib/auth/buildai-supabase-admin"
import { getSupabaseOAuthToken } from "@/lib/service/supabase-oauth"
import {
  createProject,
  getProjectApiKeys,
  inferAnonKeyFromApiKeys,
  listOrganizations,
  runSql,
  waitForProjectReady,
} from "@/lib/supabase-management"
import fs from "node:fs"
import path from "node:path"

export const runtime = "nodejs"

type Body = {
  projectName?: string
  region?: string | null
  label?: string | null
  organizationSlug?: string | null
}

function safeName(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
}

export async function POST(req: Request) {
  try {
    const userId = await requireBuildAiUserIdFromRequest(req)
    const token = await getSupabaseOAuthToken(userId)
    if (!token?.access_token) return NextResponse.json({ error: "Supabase not connected" }, { status: 409 })

    const json = (await req.json().catch(() => ({}))) as Body
    const requestedName = (json.projectName ?? "").trim()
    const baseName = requestedName ? safeName(requestedName) : `buildai-${safeName(userId.slice(0, 8))}`
    const finalName = `${baseName}-${crypto.randomBytes(3).toString("hex")}`

    const orgs = await listOrganizations(token.access_token)
    const orgSlug = (json.organizationSlug ?? "").trim() || orgs[0]?.slug
    if (!orgSlug) throw new Error("No Supabase organization found for this user")

    const dbPass = crypto.randomBytes(18).toString("base64url")

    const created = await createProject({
      accessToken: token.access_token,
      organizationSlug: orgSlug,
      name: finalName,
      dbPass,
      regionSelection: json.region ? { kind: "explicit", region: json.region } : { kind: "closest" },
    })

    const ready = await waitForProjectReady({ accessToken: token.access_token, ref: created.ref })

    const keys = await getProjectApiKeys(token.access_token, created.ref)
    const anonKey = inferAnonKeyFromApiKeys(keys)
    if (!anonKey) throw new Error("Could not retrieve anon/publishable API key for project")
    const supabaseUrl = `https://${created.ref}.supabase.co`

    // Apply BuildAI schema into user's Supabase project.
    const coreSqlPath = path.join(process.cwd(), "supabase", "buildai-core.sql")
    const schemaSql = fs.readFileSync(coreSqlPath, "utf8")
    await runSql({ accessToken: token.access_token, ref: created.ref, sql: schemaSql })

    const admin = getBuildAiSupabaseAdmin()
    const upsert = await admin.from("supabase_connections").upsert(
      {
        user_id: userId,
        project_ref: created.ref,
        supabase_url: supabaseUrl,
        anon_key: anonKey,
        region: ready.region ?? null,
        label: (json.label ?? "").trim() || finalName,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,project_ref" },
    )
    if (upsert.error) throw new Error(upsert.error.message)

    return NextResponse.json({
      ok: true,
      project: { ref: created.ref, name: finalName, organizationSlug: orgSlug, region: ready.region ?? null },
      connection: { projectRef: created.ref, supabaseUrl, anonKey },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Provision failed"
    const status = msg.toLowerCase().includes("unauthorized") ? 401 : 400
    return NextResponse.json({ error: msg }, { status })
  }
}

