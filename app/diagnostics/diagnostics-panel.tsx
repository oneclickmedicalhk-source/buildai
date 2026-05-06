"use client"

import { useEffect, useState } from "react"

type FetchResult = { name: string; ok: boolean; status?: number; ms?: number; detail?: string }

async function probe(name: string, url: string): Promise<FetchResult> {
  const t0 = performance.now()
  try {
    const res = await fetch(url, { cache: "no-store", method: "GET" })
    const ms = Math.round(performance.now() - t0)
    return { name, ok: res.ok, status: res.status, ms }
  } catch (e) {
    const ms = Math.round(performance.now() - t0)
    return { name, ok: false, ms, detail: e instanceof Error ? e.message : "fetch failed" }
  }
}

export function DiagnosticsPanel() {
  const [server, setServer] = useState<unknown>(null)
  const [client, setClient] = useState<FetchResult[]>([])
  const [origin, setOrigin] = useState("")

  useEffect(() => {
    setOrigin(window.location.origin)
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const r = await fetch("/api/diagnostics", { cache: "no-store" })
        const j = await r.json()
        if (!cancelled) setServer(j)
      } catch (e) {
        if (!cancelled) setServer({ ok: false, error: e instanceof Error ? e.message : "failed" })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!origin) return
    let cancelled = false
    void (async () => {
      const results = await Promise.all([
        probe("healthz", `${origin}/healthz`),
        probe("robots.txt", `${origin}/robots.txt`),
        probe("icon.svg", `${origin}/icon.svg`),
        probe("home HTML", `${origin}/`),
      ])
      if (!cancelled) setClient(results)
    })()
    return () => {
      cancelled = true
    }
  }, [origin])

  return (
    <div className="space-y-8 text-sm">
      <section className="rounded-2xl border border-border bg-card/40 p-5">
        <h2 className="font-semibold text-base mb-2">Server (no secrets)</h2>
        <pre className="text-xs overflow-x-auto whitespace-pre-wrap break-all text-muted-foreground">
          {JSON.stringify(server, null, 2)}
        </pre>
      </section>

      <section className="rounded-2xl border border-border bg-card/40 p-5">
        <h2 className="font-semibold text-base mb-2">Browser fetch tests</h2>
        <p className="text-xs text-muted-foreground mb-3">
          If <code className="text-foreground">healthz</code> works but <code className="text-foreground">home HTML</code> fails, your network or browser is likely blocking larger HTML or scripts (not Vercel DNS).
        </p>
        <ul className="space-y-2">
          {client.map((r) => (
            <li key={r.name} className="flex flex-wrap items-baseline gap-x-2 gap-y-1 border-b border-border/60 pb-2 last:border-0">
              <span className="font-medium">{r.name}</span>
              <span className={r.ok ? "text-emerald-600" : "text-destructive"}>{r.ok ? "OK" : "FAIL"}</span>
              {typeof r.status === "number" ? <span className="text-muted-foreground">HTTP {r.status}</span> : null}
              {typeof r.ms === "number" ? <span className="text-muted-foreground">{r.ms} ms</span> : null}
              {r.detail ? <span className="text-destructive w-full">{r.detail}</span> : null}
            </li>
          ))}
          {client.length === 0 ? <li className="text-muted-foreground">Loading…</li> : null}
        </ul>
      </section>

      <section className="rounded-2xl border border-border bg-card/40 p-5">
        <h2 className="font-semibold text-base mb-2">If Safari shows “This page couldn’t load”</h2>
        <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
          <li>Try Chrome and mobile 4G — rules out Safari-only issues.</li>
          <li>Disable iCloud Private Relay, VPN, and HTTPS scanning on routers.</li>
          <li>Temporarily disable content blockers for this site.</li>
          <li>DNS: ensure hostname <code className="text-foreground">buildai</code> has only one CNAME row (no duplicate A + CNAME).</li>
          <li>
            Use <code className="text-foreground">NEXT_PUBLIC_SITE_URL=https://buildai.oneclick.hk</code> in Vercel for correct OAuth redirects.
          </li>
        </ul>
      </section>
    </div>
  )
}
