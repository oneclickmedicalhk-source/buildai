import type { BuilderPersistedState } from "@/lib/builder-types"
import type { SyncPullResponse, SyncPushRequest, SyncPushResponse } from "@/lib/sync/sync-types"
import { mergeLocalAndRemoteState } from "@/lib/sync/merge-state"

type SyncEngineOptions = {
  /** Called when server has newer data to merge in. */
  onRemoteMerged: (next: BuilderPersistedState) => void
}

export class SyncEngine {
  private readonly onRemoteMerged: (next: BuilderPersistedState) => void
  private lastEventId: number | null = null
  private pushing = false
  private queuedState: BuilderPersistedState | null = null
  private pushTimer: number | null = null

  constructor(opts: SyncEngineOptions) {
    this.onRemoteMerged = opts.onRemoteMerged
  }

  public schedulePush(state: BuilderPersistedState): void {
    this.queuedState = state
    if (this.pushTimer != null) window.clearTimeout(this.pushTimer)
    this.pushTimer = window.setTimeout(() => {
      this.pushTimer = null
      void this.flushPush()
    }, 650)
  }

  public async pullAndMerge(local: BuilderPersistedState): Promise<void> {
    try {
      const res = await fetch(`/api/sync/pull${this.lastEventId != null ? `?since=${this.lastEventId}` : ""}`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      })
      const data = (await res.json()) as SyncPullResponse & { error?: string }
      if (!res.ok) throw new Error(data.error ?? `Sync pull failed (HTTP ${res.status})`)
      if (typeof data.lastEventId === "number") this.lastEventId = data.lastEventId
      if (data.latestSnapshot?.state) {
        const merged = mergeLocalAndRemoteState(local, data.latestSnapshot.state)
        this.onRemoteMerged(merged)
      }
    } catch {
      // Best-effort: sync is optional; local-first must continue to work.
    }
  }

  private async flushPush(): Promise<void> {
    if (this.pushing) return
    const state = this.queuedState
    if (!state) return
    this.queuedState = null
    this.pushing = true
    try {
      const body: SyncPushRequest = {
        sinceEventId: this.lastEventId,
        events: [{ kind: "snapshot", ts: Date.now(), state }],
      }
      const res = await fetch("/api/sync/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = (await res.json()) as SyncPushResponse & { error?: string }
      if (!res.ok) throw new Error(data.error ?? `Sync push failed (HTTP ${res.status})`)
      if (typeof data.lastEventId === "number") this.lastEventId = data.lastEventId
    } catch {
      // ignore; will retry on next local change
    } finally {
      this.pushing = false
      if (this.queuedState) {
        // A newer state arrived while pushing; flush again soon.
        window.setTimeout(() => void this.flushPush(), 200)
      }
    }
  }
}

