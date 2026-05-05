import type { BuilderPersistedState } from "@/lib/builder-types"

export type SyncEvent =
  | {
      kind: "snapshot"
      ts: number
      state: BuilderPersistedState
    }

export type SyncPushRequest = {
  sinceEventId?: number | null
  events: SyncEvent[]
}

export type SyncPushResponse = {
  workspaceId: string
  lastEventId: number
}

export type SyncPullResponse = {
  workspaceId: string
  lastEventId: number
  latestSnapshot?: { ts: number; state: BuilderPersistedState } | null
}

