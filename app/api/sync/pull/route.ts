import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { getSyncSupabaseAdmin } from "@/lib/sync/supabase-admin"
import type { SyncPullResponse, SyncEvent } from "@/lib/sync/sync-types"

export const runtime = "nodejs"

function getWorkspaceId(): string | null {
  const jar = cookies()
  const existing = jar.get("buildai_ws")?.value
  return existing?.trim() ? existing : null
}

export async function GET(req: Request) {
  try {
    const ws = getWorkspaceId()
    if (!ws) {
      const body: SyncPullResponse = {
        workspaceId: "",
        lastEventId: 0,
        latestSnapshot: null,
      }
      return NextResponse.json(body)
    }

    const url = new URL(req.url)
    const since = url.searchParams.get("since")
    const sinceId = since ? Number(since) : null

    const { client } = getSyncSupabaseAdmin()
    const q = client
      .from("buildai_sync_events")
      .select("id, ts, kind, payload")
      .eq("workspace_id", ws)
      .order("id", { ascending: false })
      .limit(1)

    const latestRes = await q
    if (latestRes.error) throw new Error(latestRes.error.message)
    const row = latestRes.data?.[0]
    if (!row) {
      const body: SyncPullResponse = { workspaceId: ws, lastEventId: 0, latestSnapshot: null }
      return NextResponse.json(body)
    }

    const lastEventId = row.id as number
    const payload = row.payload as SyncEvent | null
    const latestSnapshot =
      payload && payload.kind === "snapshot"
        ? { ts: payload.ts, state: payload.state }
        : null

    // If caller already has this event, no need to send snapshot.
    const body: SyncPullResponse = {
      workspaceId: ws,
      lastEventId,
      latestSnapshot: sinceId != null && sinceId >= lastEventId ? null : latestSnapshot,
    }
    return NextResponse.json(body)
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Sync pull failed"
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}

