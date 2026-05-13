"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useI18n } from "@/components/i18n-context"
import { sandpackFilesToCodeRecord } from "@/lib/sandpack-files-to-record"
import { cn } from "@/lib/utils"
import type { SandpackFiles } from "@codesandbox/sandpack-react"
import { AlertTriangle, Check, Copy, Loader2, RefreshCw } from "lucide-react"

type PreviewRuntimeMessage =
  | { type: "buildai_runtime_ok"; runtimeKey: string }
  | { type: "buildai_runtime_error"; runtimeKey: string; message: string }
  | { type: "buildai_runtime_blank"; runtimeKey: string; message: string }

function isRecoverableRuntimeWarning(message: string): boolean {
  const m = message.toLowerCase()
  return (
    (m.includes("failed to parse") && m.includes("localstorage")) ||
    m.includes("invalid localstorage") ||
    m.includes("localstorage parse")
  )
}

function escapeSrcDocScript(js: string): string {
  return js.replace(/<\/script>/gi, "<\\/script>")
}

function escapeSrcDocStyle(css: string): string {
  return css.replace(/<\/style>/gi, "<\\/style>")
}

function buildPreviewSrcDoc(js: string, css: string, runtimeKey: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<style>${escapeSrcDocStyle(css)}</style>
</head>
<body class="min-h-screen bg-zinc-950 text-zinc-50 antialiased">
<div id="root"></div>
<script>
(() => {
  const runtimeKey = ${JSON.stringify(runtimeKey)};
  const post = (payload) => {
    try {
      window.parent && window.parent.postMessage({ ...payload, runtimeKey }, "*");
    } catch {}
  };

  let hasError = false;

  const shortStack = (s) => {
    if (!s) return "";
    const lines = String(s).split("\\n").slice(0, 4);
    return lines.join("\\n");
  };

  const sendError = (msg) => {
    if (hasError) return;
    hasError = true;
    post({ type: "buildai_runtime_error", message: String(msg || "Runtime error") });
  };

  const sendBlank = (msg) => {
    if (hasError) return;
    hasError = true;
    post({ type: "buildai_runtime_blank", message: String(msg || "Blank screen") });
  };

  window.addEventListener("error", (e) => {
    const parts = [];
    parts.push(e && e.message ? String(e.message) : "window.error");
    if (e && e.filename) {
      const line = typeof e.lineno === "number" ? e.lineno : "?";
      const col = typeof e.colno === "number" ? e.colno : "?";
      parts.push("at " + e.filename + ":" + line + ":" + col);
    }
    if (e && e.error && e.error.stack) {
      parts.push(shortStack(e.error.stack));
    }
    sendError(parts.join("\\n"));
  });

  window.addEventListener("unhandledrejection", (e) => {
    const r = e && e.reason ? e.reason : null;
    const parts = [];
    if (r && typeof r === "object") {
      parts.push(r.message || "unhandledrejection");
      if (r.stack) parts.push(shortStack(r.stack));
    } else {
      parts.push(String(r || "unhandledrejection"));
    }
    sendError(parts.join("\\n"));
  });

  const origError = console.error;
  console.error = (...args) => {
    try { origError.apply(console, args); } catch {}
    const head = args && args.length ? args[0] : "console.error";
    sendError(head);
  };

  // Blank-screen detector: if root stays empty shortly after load, treat as failure.
  setTimeout(() => {
    if (hasError) return;
    const root = document.getElementById("root");
    const childCount = root ? root.childElementCount : 0;
    if (!childCount) {
      sendBlank("App rendered nothing (root is empty).");
      return;
    }
    post({ type: "buildai_runtime_ok" });
  }, 1400);
})();
</script>
<script>${escapeSrcDocScript(js)}</script>
</body>
</html>`
}

export interface PreviewLocalWorkspaceProps {
  viewMode: "preview" | "code"
  deviceSize: "desktop" | "tablet" | "mobile"
  sandpackFiles: SandpackFiles
  /** Remount iframe when version changes. */
  sandpackMountKey?: string | null
  visibleFiles: string[]
  /** When the server auto-repairs TSX (e.g. JSX text `<=`), merge into editor + persistence. */
  onPreviewSourcesPatched?: (files: Record<string, string>) => void
  /** Notify parent of runtime QA status (ok/error) with a stable files key. */
  onRuntimeQa?: (args: { status: "ok" | "error"; message?: string; filesKey: string }) => void
}

/**
 * Builds preview HTML on the server (esbuild + Tailwind) and shows it in an iframe.
 * This avoids external build services and works on restricted networks.
 */
export function PreviewLocalWorkspace({
  viewMode,
  deviceSize,
  sandpackFiles,
  sandpackMountKey,
  visibleFiles,
  onPreviewSourcesPatched,
  onRuntimeQa,
}: PreviewLocalWorkspaceProps) {
  const { t } = useI18n()
  const lastPatchedDigestRef = useRef<string>("")
  const [copied, setCopied] = useState(false)
  const [srcDoc, setSrcDoc] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [runtimeStatus, setRuntimeStatus] = useState<"pending" | "ok" | "warn" | "error">("pending")
  const [runtimeError, setRuntimeError] = useState<string | null>(null)
  const [runtimeKey, setRuntimeKey] = useState<string>("")
  const [retrySeq, setRetrySeq] = useState(0)
  const iframeRef = useRef<HTMLIFrameElement | null>(null)

  const filesRecord = useMemo(() => sandpackFilesToCodeRecord(sandpackFiles), [sandpackFiles])
  const filesKey = useMemo(() => JSON.stringify(filesRecord), [filesRecord])

  useEffect(() => {
    lastPatchedDigestRef.current = ""
  }, [filesKey])

  const [activePath, setActivePath] = useState("/App.tsx")

  useEffect(() => {
    if (!visibleFiles.includes(activePath)) {
      const first = visibleFiles[0] ?? "/App.tsx"
      setActivePath(first)
    }
  }, [visibleFiles, activePath])

  useEffect(() => {
    const ac = new AbortController()
    setLoading(true)
    setError(null)
    setSrcDoc(null)
    setRuntimeStatus("pending")
    setRuntimeError(null)
    ;(async () => {
      try {
        const res = await fetch("/api/preview-bundle", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ files: filesRecord }),
          signal: ac.signal,
        })
        const data = (await res.json()) as {
          js?: string
          css?: string
          error?: string
          patchedFiles?: Record<string, string>
        }
        if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
        if (!data.js || data.css === undefined) throw new Error("Invalid bundle response")
        if (data.patchedFiles && Object.keys(data.patchedFiles).length > 0) {
          const digest = JSON.stringify(data.patchedFiles)
          if (digest !== lastPatchedDigestRef.current) {
            lastPatchedDigestRef.current = digest
            onPreviewSourcesPatched?.(data.patchedFiles)
          }
        }
        // Unique runtime key isolates messages from previous iframes.
        const nextRuntimeKey = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
        setRuntimeKey(nextRuntimeKey)
        setSrcDoc(buildPreviewSrcDoc(data.js, data.css, nextRuntimeKey))
      } catch (e) {
        if (ac.signal.aborted) return
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        if (!ac.signal.aborted) setLoading(false)
      }
    })()
    return () => ac.abort()
  }, [filesKey, retrySeq, filesRecord, onPreviewSourcesPatched])

  useEffect(() => {
    if (!srcDoc) return
    setRuntimeStatus("pending")
    setRuntimeError(null)

    const onMsg = (ev: MessageEvent) => {
      const data = ev.data as PreviewRuntimeMessage | unknown
      if (!data || typeof data !== "object") return
      if (!("type" in data)) return
      if (!("runtimeKey" in data)) return

      // Best-effort: ensure it comes from the current iframe
      if (iframeRef.current && ev.source !== iframeRef.current.contentWindow) return

      const msg = data as PreviewRuntimeMessage
      if (msg.runtimeKey !== runtimeKey) return
      if (msg.type === "buildai_runtime_ok") {
        setRuntimeStatus("ok")
        setRuntimeError(null)
        onRuntimeQa?.({ status: "ok", filesKey })
      } else if (msg.type === "buildai_runtime_error" || msg.type === "buildai_runtime_blank") {
        const warnOnly = isRecoverableRuntimeWarning(msg.message || "")
        if (warnOnly) {
          setRuntimeStatus("warn")
          setRuntimeError(msg.message || "Runtime warning")
          // Do not trigger auto-repair loop for recoverable storage parse warnings.
          onRuntimeQa?.({ status: "ok", filesKey })
          return
        }
        setRuntimeStatus("error")
        setRuntimeError(msg.message || "Runtime error")
        onRuntimeQa?.({ status: "error", message: msg.message || "Runtime error", filesKey })
      }
    }

    window.addEventListener("message", onMsg)
    return () => window.removeEventListener("message", onMsg)
  }, [srcDoc, sandpackMountKey, filesKey, onRuntimeQa, runtimeKey])

  useEffect(() => {
    if (!srcDoc) return
    if (runtimeStatus !== "pending") return
    // Watchdog avoids "Checking runtime..." stalls if no iframe message arrives.
    const timer = window.setTimeout(() => {
      const msg = "Runtime check timed out: no signal from preview iframe."
      setRuntimeStatus("error")
      setRuntimeError(msg)
      onRuntimeQa?.({ status: "error", message: msg, filesKey })
    }, 5500)
    return () => window.clearTimeout(timer)
  }, [srcDoc, runtimeStatus, onRuntimeQa, filesKey])

  const handleRetry = useCallback(() => {
    setRetrySeq((n) => n + 1)
  }, [])

  const activeSource = useMemo(() => {
    const raw = sandpackFiles[activePath]
    if (typeof raw === "string") return raw
    return raw?.code ?? ""
  }, [sandpackFiles, activePath])

  const handleCopyActive = useCallback(async () => {
    await navigator.clipboard.writeText(activeSource)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }, [activeSource])

  const deviceFrame =
    deviceSize === "mobile"
      ? {
          wrap: "w-full flex flex-col items-center justify-start min-h-0",
          frame:
            "w-[390px] max-w-[calc(100%-0.5rem)] shrink-0 rounded-[1.75rem] border-4 border-zinc-700 bg-zinc-900 shadow-xl overflow-hidden flex flex-col min-h-0 max-h-[min(844px,calc(100vh-12rem))]",
          label: t("preview_device_mobile"),
        }
      : deviceSize === "tablet"
        ? {
            wrap: "w-full flex flex-col items-center justify-start min-h-0",
            frame:
              "w-[768px] max-w-[calc(100%-0.5rem)] shrink-0 rounded-xl border-2 border-zinc-700 bg-zinc-900/80 shadow-lg overflow-hidden flex flex-col min-h-0 max-h-[min(1024px,calc(100vh-10rem))]",
            label: t("preview_device_tablet"),
          }
        : {
            wrap: "w-full flex flex-col min-h-0",
            frame: "w-full max-w-full flex flex-col min-h-0 flex-1 rounded-lg border border-border/50 overflow-hidden",
            label: t("preview_device_desktop"),
          }

  return (
    <div className="flex flex-1 min-h-0 flex-col gap-2 p-2 min-w-0">
      <div className="shrink-0 rounded-lg border border-border bg-card/40 px-3 py-2 text-xs text-muted-foreground space-y-1">
        {loading ? (
          <div className="flex items-center gap-2 text-foreground">
            <Loader2 className="size-3.5 animate-spin shrink-0" />
            <span>{t("preview_status_preparing")}</span>
          </div>
        ) : error ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-2 text-destructive">
              <AlertTriangle className="size-3.5 shrink-0 mt-0.5" />
              <span className="break-words">{error}</span>
            </div>
            <Button type="button" variant="outline" size="sm" className="shrink-0 gap-1 h-7" onClick={handleRetry}>
              <RefreshCw className="size-3" />
              {t("preview_action_retry")}
            </Button>
          </div>
        ) : runtimeStatus === "pending" ? (
          <div className="flex items-center gap-2 text-foreground">
            <Loader2 className="size-3.5 animate-spin shrink-0" />
            <span>{t("preview_status_checking_runtime")}</span>
          </div>
        ) : runtimeStatus === "error" ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-2 text-destructive">
              <AlertTriangle className="size-3.5 shrink-0 mt-0.5" />
              <span className="break-words">{runtimeError ?? t("preview_status_runtime_error")}</span>
            </div>
            <Button type="button" variant="outline" size="sm" className="shrink-0 gap-1 h-7" onClick={handleRetry}>
              <RefreshCw className="size-3" />
              {t("preview_action_retry")}
            </Button>
          </div>
        ) : runtimeStatus === "warn" ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-2 text-amber-700 dark:text-amber-300">
              <AlertTriangle className="size-3.5 shrink-0 mt-0.5" />
              <span className="break-words">{runtimeError ?? t("preview_status_runtime_warning")}</span>
            </div>
            <Button type="button" variant="outline" size="sm" className="shrink-0 gap-1 h-7" onClick={handleRetry}>
              <RefreshCw className="size-3" />
              {t("preview_action_retry")}
            </Button>
          </div>
        ) : (
          <div className="text-emerald-600 dark:text-emerald-400">{t("preview_status_ready")}</div>
        )}
      </div>

      {viewMode === "preview" ? (
        <div className="flex-1 min-h-0 min-w-0 flex flex-col rounded-lg border border-border overflow-hidden bg-muted/20">
          <p className="shrink-0 px-2 py-1 text-[10px] text-muted-foreground text-center border-b border-border/60 bg-card/40">
            {deviceFrame.label}
          </p>
          <div className={cn("flex-1 min-h-0 min-w-0 flex flex-col p-2", deviceFrame.wrap)}>
            <div className={cn("flex-1 min-h-0 flex flex-col bg-zinc-950", deviceFrame.frame)}>
              {srcDoc ? (
                <div className="relative flex-1 min-h-[280px] w-full min-w-0 bg-zinc-950">
                  <iframe
                    ref={iframeRef}
                    key={sandpackMountKey ?? "preview"}
                    title="Preview"
                    className="absolute inset-0 h-full w-full border-0 bg-zinc-950"
                    sandbox="allow-scripts"
                    srcDoc={srcDoc}
                  />
                  {loading || error || runtimeStatus === "pending" || runtimeStatus === "error" ? (
                    <div className="absolute inset-0 flex items-center justify-center bg-zinc-950/70 text-zinc-200">
                      <div className="flex items-center gap-2 text-sm">
                        <Loader2 className="size-4 animate-spin shrink-0" />
                        <span>
                          {error
                            ? t("preview_overlay_bundle_failed")
                            : runtimeStatus === "pending"
                              ? t("preview_overlay_runtime_checking")
                              : t("preview_overlay_runtime_failed")}
                        </span>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="flex-1 min-h-[200px] flex items-center justify-center text-sm text-muted-foreground">
                  {loading
                    ? t("preview_status_bundling")
                    : error
                      ? t("preview_overlay_bundle_failed")
                      : t("preview_status_waiting")}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-1 min-h-0 flex-col rounded-lg border border-border overflow-hidden bg-card/30">
          <div className="border-b border-border px-2 py-1.5 flex items-center gap-2 shrink-0 flex-wrap">
            <Tabs value={activePath} onValueChange={setActivePath}>
              <TabsList className="h-8 flex-wrap justify-start max-h-24 overflow-y-auto">
                {visibleFiles.map((p) => (
                  <TabsTrigger key={p} value={p} className="text-xs px-2 max-w-[140px] truncate">
                    {p.replace(/^\//, "")}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 ml-auto" onClick={() => void handleCopyActive()}>
              {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
              {t("preview_action_copy")}
            </Button>
          </div>
          <ScrollArea className="flex-1 min-h-0">
            <pre className="p-3 text-xs font-mono whitespace-pre-wrap break-words">{activeSource}</pre>
          </ScrollArea>
        </div>
      )}
    </div>
  )
}
