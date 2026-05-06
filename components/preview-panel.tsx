"use client"

import { useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  Monitor,
  Tablet,
  Smartphone,
  Code2,
  Eye,
  Download,
  ExternalLink,
  RefreshCw,
  Sparkles,
  Loader2,
  Wand2,
  Maximize2,
  Minimize2,
  Rocket,
} from "lucide-react"
import type { SandpackFiles } from "@codesandbox/sandpack-react"
import JSZip from "jszip"
import { toast } from "sonner"
import { PreviewLocalWorkspace } from "@/components/preview-local-workspace"
import { useI18n } from "@/components/i18n-context"
import type { BuilderDeployment } from "@/lib/builder-types"

export interface PreviewVersionOption {
  id: string
  label: string
  subtitle: string
}

export interface PreviewPanelProps {
  hasGenerated: boolean
  title?: string
  versionLabel?: string
  /** Latest published deployment for this project (if any). */
  lastDeployment?: BuilderDeployment | null
  /** Dropdown to switch saved versions (same as sidebar History). */
  versionPicker?: {
    versions: PreviewVersionOption[]
    currentVersionId: string | null
    onSelectVersion: (versionId: string) => void
  }
  /** Remount preview iframe when the saved version changes. */
  sandpackMountKey?: string | null
  sandpackFiles: SandpackFiles
  onRefresh?: () => void
  refreshing?: boolean
  /** Phase D: layout polish pass (second model call with existing code). */
  onPolish?: () => void
  polishing?: boolean
  /** Server repaired TSX (e.g. JSX `<=`); merge into editor + persistence. */
  onPreviewSourcesPatched?: (files: Record<string, string>) => void
  /** Runtime QA result from iframe (ok/error). */
  onRuntimeQa?: (args: { status: "ok" | "error"; message?: string; filesKey: string }) => void
  /** Optional pane control from host (e.g. expand/minimize preview pane). */
  onToggleExpand?: () => void
  previewExpanded?: boolean
  /** Open Publish flow (GitHub + Vercel). */
  onPublish?: () => void
}

export function PreviewPanel({
  hasGenerated,
  title,
  versionLabel,
  lastDeployment,
  versionPicker,
  sandpackMountKey,
  sandpackFiles,
  onRefresh,
  refreshing,
  onPolish,
  polishing,
  onPreviewSourcesPatched,
  onRuntimeQa,
  onToggleExpand,
  previewExpanded,
  onPublish,
}: PreviewPanelProps) {
  const { t } = useI18n()
  const [viewMode, setViewMode] = useState<"preview" | "code">("preview")
  const [deviceSize, setDeviceSize] = useState<"desktop" | "tablet" | "mobile">("desktop")

  const visibleFiles = useMemo(() => {
    return Object.keys(sandpackFiles).filter((k) => !k.includes("node_modules"))
  }, [sandpackFiles])

  const handleDownload = async () => {
    const zip = new JSZip()
    for (const [path, val] of Object.entries(sandpackFiles)) {
      const code = typeof val === "string" ? val : val.code
      zip.file(path.replace(/^\//, ""), code)
    }
    const blob = await zip.generateAsync({ type: "blob" })
    const a = document.createElement("a")
    a.href = URL.createObjectURL(blob)
    a.download = `buildai-export-${Date.now()}.zip`
    a.click()
    URL.revokeObjectURL(a.href)
    toast.success(t("preview_download_done"))
  }

  const handleExternal = () => {
    toast.message(t("preview_deploy_hint"))
  }

  if (!hasGenerated) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center px-8 bg-card/30">
        <div className="size-20 rounded-2xl bg-secondary/50 flex items-center justify-center mb-6">
          <Eye className="size-10 text-muted-foreground" />
        </div>
        <h3 className="text-xl font-semibold mb-2 text-balance">{t("preview_title_empty")}</h3>
        <p className="text-muted-foreground max-w-sm text-balance">
          {t("preview_desc_empty")}
        </p>
      </div>
    )
  }

  return (
    <TooltipProvider delayDuration={300}>
      <div className="h-full flex flex-col min-h-0">
        {/* Two fixed rows: title/version never share a row with Preview/Code tabs (avoids overlap). */}
        <div className="border-b border-border px-2 sm:px-4 bg-card/50 shrink-0 py-2 flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2 min-w-0 w-full">
            <Badge
              variant="outline"
              className="gap-1 font-normal max-w-full min-w-0 sm:max-w-[min(22rem,100%)]"
              title={title || "Generated"}
            >
              <Sparkles className="size-3 shrink-0" />
              <span className="truncate">{title || "Generated"}</span>
            </Badge>
            {versionPicker && versionPicker.versions.length > 0 ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="shrink-0">
                    <Select
                      value={versionPicker.currentVersionId ?? versionPicker.versions[0]?.id}
                      onValueChange={versionPicker.onSelectVersion}
                    >
                      <SelectTrigger
                        size="sm"
                        className="h-7 w-[4.5rem] text-xs px-2"
                        aria-label="Preview version"
                      >
                        <SelectValue placeholder="Ver." />
                      </SelectTrigger>
                      <SelectContent position="popper" className="max-w-[min(90vw,280px)]">
                        {[...versionPicker.versions].reverse().map((v) => (
                          <SelectItem key={v.id} value={v.id} className="text-xs">
                            <span className="font-medium tabular-nums">{v.label}</span>
                            <span className="block text-muted-foreground truncate max-w-[220px]">{v.subtitle}</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom">Switch saved version (preview + code)</TooltipContent>
              </Tooltip>
            ) : versionLabel ? (
              <span className="text-xs text-muted-foreground shrink-0 tabular-nums">{versionLabel}</span>
            ) : null}
            {lastDeployment?.url ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <a
                    className="text-xs text-accent underline underline-offset-4 truncate max-w-[min(40vw,320px)]"
                    href={lastDeployment.url}
                    target="_blank"
                    rel="noreferrer"
                    title={lastDeployment.url}
                  >
                    Live: {lastDeployment.url.replace(/^https?:\/\//, "")}
                  </a>
                </TooltipTrigger>
                <TooltipContent side="bottom">Last published URL</TooltipContent>
              </Tooltip>
            ) : null}
          </div>

          <div className="flex w-full min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
            <div className="min-w-0 shrink overflow-x-auto">
            <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as "preview" | "code")}>
              <TabsList className="h-8 shrink-0">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <TabsTrigger value="preview" className="text-xs gap-1 px-2 sm:px-3">
                      <Eye className="size-3" />
                      {t("preview_tab_preview")}
                    </TabsTrigger>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">{t("preview_tooltip_live")}</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <TabsTrigger value="code" className="text-xs gap-1 px-2 sm:px-3">
                      <Code2 className="size-3" />
                      {t("preview_tab_code")}
                    </TabsTrigger>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">{t("preview_tooltip_code")}</TooltipContent>
                </Tooltip>
              </TabsList>
            </Tabs>
            </div>

            <div className="flex items-center justify-end gap-0.5 sm:gap-1 shrink-0 flex-wrap sm:flex-nowrap">
              {viewMode === "preview" && (
                <div className="flex items-center border border-border rounded-lg p-0.5 mr-1 overflow-x-auto max-w-[min(55vw,260px)]">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant={deviceSize === "desktop" ? "secondary" : "ghost"}
                        size="sm"
                        className="h-7 px-2"
                        onClick={() => setDeviceSize("desktop")}
                        aria-pressed={deviceSize === "desktop"}
                      >
                        <Monitor className="size-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="max-w-xs">
                      Desktop: full width preview (same CSS as a wide browser — not a separate device engine)
                    </TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant={deviceSize === "tablet" ? "secondary" : "ghost"}
                        size="sm"
                        className="h-7 px-2"
                        onClick={() => setDeviceSize("tablet")}
                        aria-pressed={deviceSize === "tablet"}
                      >
                        <Tablet className="size-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="max-w-xs">
                      Tablet frame: iframe width ~768px (viewport sizing only; user-agent unchanged)
                    </TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant={deviceSize === "mobile" ? "secondary" : "ghost"}
                        size="sm"
                        className="h-7 px-2"
                        onClick={() => setDeviceSize("mobile")}
                        aria-pressed={deviceSize === "mobile"}
                      >
                        <Smartphone className="size-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="max-w-xs">
                      Phone frame: iframe width ~390px (typical phone width; not iOS/Android emulation)
                    </TooltipContent>
                  </Tooltip>
                </div>
              )}
              {onToggleExpand ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={() => onToggleExpand()}
                      aria-label={previewExpanded ? "Minimize preview pane" : "Expand preview pane"}
                    >
                      {previewExpanded ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">{previewExpanded ? "Minimize preview pane" : "Expand preview pane"}</TooltipContent>
                </Tooltip>
              ) : null}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    disabled={!onRefresh || refreshing || polishing}
                    onClick={() => onRefresh?.()}
                  >
                    {refreshing ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Regenerate from last prompt (↻)</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    disabled={!onPolish || polishing || refreshing}
                    onClick={() => onPolish?.()}
                  >
                    {polishing ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">AI polish: spacing, responsive, a11y (keeps behavior)</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={() => (onPublish ? onPublish() : handleExternal())}
                    aria-label="Publish"
                  >
                    <Rocket className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">{onPublish ? t("preview_publish") : "Deploy hint (use Download)"}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={handleDownload}>
                    <Download className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Download all files as ZIP</TooltipContent>
              </Tooltip>
            </div>
          </div>
        </div>

        <div className="flex flex-1 min-h-0 flex-col overflow-hidden">
          <PreviewLocalWorkspace
            viewMode={viewMode}
            deviceSize={deviceSize}
            sandpackFiles={sandpackFiles}
            sandpackMountKey={sandpackMountKey}
            visibleFiles={visibleFiles}
            onPreviewSourcesPatched={onPreviewSourcesPatched}
            onRuntimeQa={onRuntimeQa}
          />
        </div>
      </div>
    </TooltipProvider>
  )
}
