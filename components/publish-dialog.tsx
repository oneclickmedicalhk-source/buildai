"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
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
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import type { BuilderDeployment, BuilderIntegrations } from "@/lib/builder-types"
import { useI18n } from "@/components/i18n-context"

export function PublishDialog({
  open,
  onOpenChange,
  defaultSiteName,
  modelFiles,
  integrations,
  projectId,
  versionId,
  onPublished,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultSiteName: string
  modelFiles: Record<string, string>
  integrations: BuilderIntegrations
  projectId: string | null
  versionId: string | null
  onPublished?: (deployment: BuilderDeployment) => void
}) {
  const { t } = useI18n()
  const [siteName, setSiteName] = useState(defaultSiteName)
  const [repoName, setRepoName] = useState(slug(defaultSiteName) || "buildai-site")
  const [status, setStatus] = useState<{ githubConnected: boolean; vercelConnected: boolean } | null>(null)
  const [publishing, setPublishing] = useState(false)
  const [result, setResult] = useState<{ url: string; repo: string } | null>(null)

  useEffect(() => {
    if (!open) return
    setResult(null)
    void refreshStatus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    if (!open) return
    setRepoName((prev) => (prev.trim() ? prev : slug(siteName) || "buildai-site"))
  }, [siteName, open])

  const ready = Boolean(status?.githubConnected && status?.vercelConnected)

  const canPublish = useMemo(() => {
    return (
      ready &&
      Boolean(siteName.trim()) &&
      Boolean(repoName.trim()) &&
      Object.keys(modelFiles).length > 0 &&
      !publishing
    )
  }, [ready, siteName, repoName, modelFiles, publishing])

  const connectGithub = () => {
    window.open("/api/oauth/github/start", "_blank", "width=820,height=720")
    toast.message("GitHub：請喺新視窗完成授權。")
  }

  const connectVercel = () => {
    window.open("/api/oauth/vercel/start", "_blank", "width=820,height=720")
    toast.message("Vercel：請喺新視窗完成授權。")
  }

  const refreshStatus = async () => {
    const res = await fetch("/api/publish/status", { method: "GET" })
    const data = (await res.json()) as { githubConnected: boolean; vercelConnected: boolean }
    setStatus(data)
    return data
  }

  const handlePublish = async () => {
    try {
      setPublishing(true)
      setResult(null)
      const latest = await refreshStatus()
      if (!latest.githubConnected || !latest.vercelConnected) {
        throw new Error("請先連接 GitHub 同 Vercel。")
      }
      const res = await fetch("/api/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siteName: siteName.trim(),
          repoName: repoName.trim(),
          modelFiles,
          integrations: { supabase: integrations.supabase },
        }),
      })
      const data = (await res.json()) as { url?: string; repo?: string; deploymentId?: string; error?: string }
      if (!res.ok) throw new Error(data.error ?? "發佈失敗")
      if (!data.url || !data.repo) throw new Error("發佈完成但未有返回網址")
      setResult({ url: data.url, repo: data.repo })
      if (projectId && onPublished) {
        onPublished({
          id: `dep-${Date.now()}-${Math.random().toString(16).slice(2)}`,
          createdAt: Date.now(),
          versionId,
          siteName: siteName.trim(),
          repoName: repoName.trim(),
          repoUrl: data.repo,
          url: data.url,
          ...(data.deploymentId ? { vercelDeploymentId: data.deploymentId } : {}),
        })
      }
      toast.success(t("preview_publish_done"))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "發佈失敗")
    } finally {
      setPublishing(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("publish_title")}</DialogTitle>
          <DialogDescription>
            {t("publish_desc")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="siteName">Site name</Label>
              <Input id="siteName" value={siteName} onChange={(e) => setSiteName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="repoName">GitHub repo name</Label>
              <Input id="repoName" value={repoName} onChange={(e) => setRepoName(e.target.value)} />
              <p className="text-xs text-muted-foreground">Lowercase letters, numbers, and dashes are safest.</p>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card/30 p-3 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-medium">{t("publish_connections")}</div>
              <Button type="button" variant="outline" size="sm" className="h-8" onClick={() => void refreshStatus()}>
                {t("publish_refresh")}
              </Button>
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium">GitHub</div>
                  <div className="text-xs text-muted-foreground">Create a repo and push your generated site.</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {status?.githubConnected ? <Badge className="bg-accent/20 text-accent border-0">Connected</Badge> : null}
                  <Button type="button" size="sm" className="h-8" onClick={connectGithub}>
                    {status?.githubConnected ? t("publish_reconnect") : t("publish_connect")}
                  </Button>
                </div>
              </div>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium">Vercel</div>
                  <div className="text-xs text-muted-foreground">Deploy and return a public URL.</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {status?.vercelConnected ? <Badge className="bg-accent/20 text-accent border-0">Connected</Badge> : null}
                  <Button type="button" size="sm" className="h-8" onClick={connectVercel}>
                    {status?.vercelConnected ? t("publish_reconnect") : t("publish_connect")}
                  </Button>
                </div>
              </div>
            </div>

            {!ready ? (
              <p className="text-xs text-muted-foreground">
                Tip: if the connect window is blocked, allow popups for this site and try again.
              </p>
            ) : null}
          </div>

          {result ? (
            <div className="rounded-xl border border-border bg-muted/20 p-3 space-y-2">
              <div className="text-sm font-medium">{t("preview_publish_done")}</div>
              <div className="text-sm">
                {t("publish_live_url")}:{" "}
                <a className="text-accent underline underline-offset-4" href={result.url} target="_blank" rel="noreferrer">
                  {result.url}
                </a>
              </div>
              <div className="text-sm">
                {t("publish_repo")}:{" "}
                <a className="text-accent underline underline-offset-4" href={result.repo} target="_blank" rel="noreferrer">
                  {result.repo}
                </a>
              </div>
              <div className="flex items-center gap-2 pt-1">
                <Button asChild size="sm" className="h-8">
                  <a href={result.url} target="_blank" rel="noreferrer">
                    {t("publish_open_site")}
                  </a>
                </Button>
                <Button asChild size="sm" variant="outline" className="h-8">
                  <a href={result.repo} target="_blank" rel="noreferrer">
                    {t("publish_view_repo")}
                  </a>
                </Button>
              </div>
            </div>
          ) : null}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2 sm:gap-3">
          <div className="text-xs text-muted-foreground sm:mr-auto">
            Need help? See <Link href="/docs" className="text-accent underline underline-offset-4">Docs</Link>.
          </div>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={publishing}>
            {t("publish_close")}
          </Button>
          <Button type="button" onClick={() => void handlePublish()} disabled={!canPublish}>
            {publishing ? t("publish_publishing") : t("publish_title")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60)
}

