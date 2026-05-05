"use client"

import { useState, useEffect } from "react"
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
  const [tab, setTab] = useState<IntegrationTab>(initialTab)
  const [supabaseUrl, setSupabaseUrl] = useState("")
  const [supabaseAnon, setSupabaseAnon] = useState("")
  const [vercel, setVercel] = useState(false)
  const [stripe, setStripe] = useState(false)

  useEffect(() => {
    if (open) {
      setTab(initialTab)
      setSupabaseUrl(integrations.supabase?.url ?? "")
      setSupabaseAnon(integrations.supabase?.anonKey ?? "")
      setVercel(integrations.vercelConnected)
      setStripe(integrations.stripeConnected)
    }
  }, [open, initialTab, integrations])

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
          <DialogTitle>Integrations</DialogTitle>
          <DialogDescription>
            Connect services for your generated previews. Keys stay in your browser unless you deploy elsewhere.
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
                . OAuth connect is planned; see{" "}
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
