"use client"

import { useMemo, useState, useEffect } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { BuilderIntegrations } from "@/lib/builder-types"
import { ExternalLink } from "lucide-react"
import { useAuth } from "@/components/auth-context"
import { useI18n } from "@/components/i18n-context"
import { toast } from "sonner"

export type IntegrationTab = "supabase" | "vercel" | "stripe"

interface IntegrationsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialTab?: IntegrationTab
  integrations: BuilderIntegrations
  onSave: (next: BuilderIntegrations) => void
}

export function IntegrationsDialog({
  open,
  onOpenChange,
  initialTab = "supabase",
  integrations,
  onSave,
}: IntegrationsDialogProps) {
  const { accessToken } = useAuth()
  const { lang } = useI18n()
  const [tab, setTab] = useState<IntegrationTab>(initialTab)
  const [supabaseUrl, setSupabaseUrl] = useState("")
  const [supabaseAnon, setSupabaseAnon] = useState("")
  const [supabaseOauthConnected, setSupabaseOauthConnected] = useState(false)
  const [supabaseConnections, setSupabaseConnections] = useState<Array<{ project_ref: string; supabase_url: string; label?: string | null; anon_key?: string }>>([])
  const [creating, setCreating] = useState(false)
  const [region, setRegion] = useState<string>("")
  const [projectName, setProjectName] = useState<string>("")
  const [vercel, setVercel] = useState(false)
  const [stripe, setStripe] = useState(false)

  const headers = useMemo(() => {
    return {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    }
  }, [accessToken])

  useEffect(() => {
    if (open) {
      setTab(initialTab)
      setSupabaseUrl(integrations.supabase?.url ?? "")
      setSupabaseAnon(integrations.supabase?.anonKey ?? "")
      setVercel(integrations.vercelConnected)
      setStripe(integrations.stripeConnected)
    }
  }, [open, initialTab, integrations])

  useEffect(() => {
    if (!open) return
    if (!accessToken) return
    void (async () => {
      try {
        const res = await fetch("/api/integrations/supabase/status", { method: "GET", headers })
        const data = (await res.json()) as { oauthConnected?: boolean; connections?: any[]; error?: string }
        if (!res.ok) throw new Error(data.error ?? "Failed to load Supabase status")
        setSupabaseOauthConnected(Boolean(data.oauthConnected))
        setSupabaseConnections(Array.isArray(data.connections) ? data.connections : [])
      } catch (e) {
        // Non-fatal: keep manual paste mode.
      }
    })()
  }, [open, accessToken, headers])

  const startSupabaseOAuth = async () => {
    if (!accessToken) {
      toast.error(lang === "zh-HK" ? "請先登入" : "Please sign in first")
      return
    }
    const res = await fetch("/api/oauth/supabase/start", { method: "POST", headers })
    const data = (await res.json()) as { url?: string; error?: string }
    if (!res.ok || !data.url) {
      toast.error(data.error ?? (lang === "zh-HK" ? "Supabase 連接失敗" : "Supabase connect failed"))
      return
    }
    window.location.href = data.url
  }

  const provisionSupabase = async () => {
    if (!accessToken) {
      toast.error(lang === "zh-HK" ? "請先登入" : "Please sign in first")
      return
    }
    setCreating(true)
    try {
      const res = await fetch("/api/integrations/supabase/provision", {
        method: "POST",
        headers,
        body: JSON.stringify({
          projectName: projectName.trim() || undefined,
          region: region.trim() || undefined,
        }),
      })
      const data = (await res.json()) as { connection?: { supabaseUrl: string; anonKey: string }; error?: string }
      if (!res.ok || !data.connection) throw new Error(data.error ?? "Provision failed")
      setSupabaseUrl(data.connection.supabaseUrl)
      setSupabaseAnon(data.connection.anonKey)
      toast.success(lang === "zh-HK" ? "已建立並連接 Supabase project" : "Supabase project created and connected")
    } finally {
      setCreating(false)
    }
  }

  const handleSave = () => {
    const supabase =
      supabaseUrl.trim() && supabaseAnon.trim()
        ? { url: supabaseUrl.trim(), anonKey: supabaseAnon.trim() }
        : null
    onSave({
      supabase,
      vercelConnected: vercel,
      stripeConnected: stripe,
    })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{lang === "zh-HK" ? "整合" : "Integrations"}</DialogTitle>
          <DialogDescription>
            {lang === "zh-HK"
              ? "連接外部服務（例如 Supabase）。未發佈之前，連線資料只會留喺你部瀏覽器。"
              : "Connect services like Supabase. Before you publish, connection info stays in your browser."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-2 border-b border-border pb-2">
          {(["supabase", "vercel", "stripe"] as const).map((t) => (
            <Button
              key={t}
              type="button"
              variant={tab === t ? "secondary" : "ghost"}
              size="sm"
              className="capitalize"
              onClick={() => setTab(t)}
            >
              {t}
            </Button>
          ))}
        </div>

        {tab === "supabase" && (
          <div className="space-y-4 py-2">
            <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {lang === "zh-HK" ? "一鍵連接（建議）" : "1-click connect (recommended)"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {lang === "zh-HK"
                      ? "授權一次後，BuildAI 可以幫你建立免費 Supabase project，亦可以重用喺多個 BuildAI 專案。"
                      : "Authorize once; BuildAI can create a free Supabase project and reuse it across BuildAI projects."}
                  </p>
                </div>
                <Button type="button" size="sm" onClick={() => void startSupabaseOAuth()}>
                  {supabaseOauthConnected ? (lang === "zh-HK" ? "重新連接" : "Re-connect") : lang === "zh-HK" ? "連接" : "Connect"}
                </Button>
              </div>

              {supabaseOauthConnected ? (
                <div className="space-y-2 pt-1">
                  {supabaseConnections.length ? (
                    <div className="rounded-md border border-border bg-background/40 p-2">
                      <p className="text-xs font-medium text-foreground mb-1">Use existing connection</p>
                      <div className="flex flex-wrap gap-2">
                        {supabaseConnections.slice(0, 3).map((c) => (
                          <Button
                            key={c.project_ref}
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setSupabaseUrl(c.supabase_url)
                              if (c.anon_key) setSupabaseAnon(c.anon_key)
                              toast.success(lang === "zh-HK" ? "已選取 Supabase 連線" : "Selected Supabase connection")
                            }}
                          >
                            {c.label || c.project_ref}
                          </Button>
                        ))}
                      </div>
                      {supabaseConnections.length > 3 ? (
                        <p className="text-[11px] text-muted-foreground mt-2">
                          {lang === "zh-HK"
                            ? `仲有 ${supabaseConnections.length - 3} 個連線`
                            : `${supabaseConnections.length - 3} more connections available.`}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label htmlFor="sb-proj">{lang === "zh-HK" ? "Project 名稱（可選）" : "Project name (optional)"}</Label>
                      <Input id="sb-proj" value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder="buildai-demo" />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="sb-region">{lang === "zh-HK" ? "地區（可選）" : "Region (optional)"}</Label>
                      <Input id="sb-region" value={region} onChange={(e) => setRegion(e.target.value)} placeholder="(auto: closest to HK)" />
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Button type="button" size="sm" variant="secondary" onClick={() => void provisionSupabase()} disabled={creating}>
                      {creating ? (lang === "zh-HK" ? "建立中…" : "Creating…") : lang === "zh-HK" ? "建立 Supabase project" : "Create Supabase project"}
                    </Button>
                    {supabaseConnections.length ? (
                      <span className="text-xs text-muted-foreground">
                        {lang === "zh-HK"
                          ? `已有連線：${supabaseConnections.length}（唔一定要新建）`
                          : `Existing connections: ${supabaseConnections.length} (new project is optional)`}
                      </span>
                    ) : null}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {lang === "zh-HK"
                    ? "連接後，你可以一鍵建立 project（免費方案），我哋會自動填好 URL + anon key。"
                    : "After connecting, you can auto-create a project (free plan) and we will fill the URL + anon key for you."}
                </p>
              )}
            </div>

            <ol className="list-decimal space-y-3 pl-4 text-sm text-muted-foreground">
              <li>
                Open your project in the Supabase dashboard →{" "}
                <a
                  href="https://supabase.com/dashboard"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-emerald-400 underline-offset-4 hover:underline"
                >
                  supabase.com/dashboard
                  <ExternalLink className="size-3 shrink-0 opacity-80" aria-hidden />
                </a>
                .
              </li>
              <li>
                Go to{" "}
                <strong className="text-foreground">Settings → API</strong>. Copy{" "}
                <strong className="text-foreground">Project URL</strong> and the{" "}
                <strong className="text-foreground">anon public</strong> key (not the service role).
              </li>
              <li>Paste both below and save. This app injects them as Create React App env names for the preview iframe.</li>
            </ol>

            <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs">
              <p className="mb-2 font-medium text-foreground">Env name mapping</p>
              <table className="w-full border-collapse text-left text-[11px] text-muted-foreground">
                <thead>
                  <tr className="border-b border-border/80">
                    <th className="py-1 pr-2 font-medium text-foreground">This preview (CRA)</th>
                    <th className="py-1 font-medium text-foreground">If you deploy to Next.js</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-border/60">
                    <td className="py-1 pr-2 font-mono text-emerald-400/90">REACT_APP_SUPABASE_URL</td>
                    <td className="py-1 font-mono">NEXT_PUBLIC_SUPABASE_URL</td>
                  </tr>
                  <tr>
                    <td className="py-1 pr-2 font-mono text-emerald-400/90">REACT_APP_SUPABASE_ANON_KEY</td>
                    <td className="py-1 font-mono">NEXT_PUBLIC_SUPABASE_ANON_KEY</td>
                  </tr>
                </tbody>
              </table>
              <p className="mt-2 text-[11px] leading-relaxed">
                Docs:{" "}
                <a
                  href="https://supabase.com/docs/guides/api"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-emerald-400 underline-offset-4 hover:underline"
                >
                  API settings
                  <ExternalLink className="size-3 shrink-0 opacity-80" aria-hidden />
                </a>
                . OAuth connect is supported via Supabase OAuth in this app; manual paste remains available. See{" "}
                <code className="rounded bg-background/80 px-1 py-0.5 font-mono text-[10px]">
                  docs/integrations-oauth-roadmap.md
                </code>{" "}
                in the repo.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="sb-url">Project URL</Label>
              <Input
                id="sb-url"
                placeholder="https://xxxx.supabase.co"
                value={supabaseUrl}
                onChange={(e) => setSupabaseUrl(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sb-anon">Anon public key</Label>
              <Input
                id="sb-anon"
                placeholder="eyJ..."
                value={supabaseAnon}
                onChange={(e) => setSupabaseAnon(e.target.value)}
                className="font-mono text-xs"
              />
            </div>
          </div>
        )}

        {tab === "vercel" && (
          <div className="space-y-3 py-2 text-sm text-muted-foreground">
            <ol className="list-decimal space-y-2 pl-4">
              <li>Create or open a Vercel project for this app.</li>
              <li>
                Link the Git repo (or use{" "}
                <a
                  href="https://vercel.com/docs/cli"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-emerald-400 underline-offset-4 hover:underline"
                >
                  Vercel CLI
                  <ExternalLink className="size-3 shrink-0 opacity-80" aria-hidden />
                </a>
                ) and set the same env names as in the Supabase tab if you use the database.
              </li>
              <li>Flip the flag below once production URL and env are ready.</li>
            </ol>
            <p>
              Mark as connected when you are ready to deploy exports to Vercel. Full OAuth wiring can be added later.
            </p>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={vercel}
                onChange={(e) => setVercel(e.target.checked)}
                className="rounded border-border"
              />
              <span>Vercel connected (local flag)</span>
            </label>
          </div>
        )}

        {tab === "stripe" && (
          <div className="space-y-3 py-2 text-sm text-muted-foreground">
            <ol className="list-decimal space-y-2 pl-4">
              <li>
                Use the{" "}
                <a
                  href="https://dashboard.stripe.com/apikeys"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-emerald-400 underline-offset-4 hover:underline"
                >
                  Stripe Dashboard
                  <ExternalLink className="size-3 shrink-0 opacity-80" aria-hidden />
                </a>{" "}
                for publishable/secret keys on your deployed backend only.
              </li>
              <li>Never paste live secret keys into this builder chat — they would be sent to the model.</li>
            </ol>
            <p>
              For now this is a status flag. Stripe keys should never be sent to the AI API; add Checkout in a later phase.
            </p>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={stripe}
                onChange={(e) => setStripe(e.target.checked)}
                className="rounded border-border"
              />
              <span>Stripe connected (local flag)</span>
            </label>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSave}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
