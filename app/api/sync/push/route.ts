import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { z } from "zod"
import { getSyncSupabaseAdmin } from "@/lib/sync/supabase-admin"
import type { SyncEvent } from "@/lib/sync/sync-types"

export const runtime = "nodejs"

const syncEventSchema = z.object({
  kind: z.literal("snapshot"),
  ts: z.number(),
  state: z.any(),
})

const pushSchema = z.object({
  sinceEventId: z.number().nullable().optional(),
  events: z.array(syncEventSchema).min(1),
})

function getOrCreateWorkspaceId(): string {
  const jar = cookies()
  const existing = jar.get("buildai_ws")?.value
  if (existing?.trim()) return existing
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `ws-${Date.now()}-${Math.random().toString(16).slice(2)}`
  jar.set("buildai_ws", id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  })
  return id
}

export async function POST(req: Request) {
  try {
    const raw: unknown = await req.json()
    const body = pushSchema.parse(raw)
    const workspaceId = getOrCreateWorkspaceId()
    const { client } = getSyncSupabaseAdmin()

    const last = body.events[body.events.length - 1] as SyncEvent
    if (!last || last.kind !== "snapshot") {
      return NextResponse.json({ error: "Only snapshot events are supported right now." }, { status: 400 })
    }

    const insertRes = await client
      .from("buildai_sync_events")
      .insert({
        workspace_id: workspaceId,
        ts: last.ts,
        kind: last.kind,
        payload: last,
      })
      .select("id")
      .single()

    if (insertRes.error) throw new Error(insertRes.error.message)
    const lastEventId = insertRes.data?.id
    if (typeof lastEventId !== "number") throw new Error("Invalid insert id")

    return NextResponse.json({ workspaceId, lastEventId })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Sync push failed"
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}

