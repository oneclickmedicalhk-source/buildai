"use client"

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { Header } from "@/components/header"
import { ProjectSidebar } from "@/components/project-sidebar"
import { ChatPanel } from "@/components/chat-panel"
import { PreviewPanel } from "@/components/preview-panel"
import { IntegrationsDialog, type IntegrationTab } from "@/components/integrations-dialog"
import { PublishDialog } from "@/components/publish-dialog"
import { Button } from "@/components/ui/button"
import { PanelLeftClose, PanelLeft, Maximize2, Minimize2 } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  appendVersion,
  createEmptyPersistedState,
  createProject,
  loadPersistedState,
  savePersistedState,
} from "@/lib/builder-storage"
import type { BuilderChatMessage, BuilderPersistedState } from "@/lib/builder-types"
import type { BuilderDeployment } from "@/lib/builder-types"
import { SyncEngine } from "@/lib/sync/sync-engine"
import { getTemplatePresetById } from "@/lib/templates/templates"
import {
  buildDotEnvFromSupabase,
  buildSandpackFiles,
  splitModelFiles,
} from "@/lib/sandpack-tailwind-template"
import type { ChatGenerateSuccess } from "@/components/chat-panel"
import type { GenerateResponse } from "@/lib/ai-generate-schema"
import { toast } from "sonner"
import { useAuth } from "@/components/auth-context"

function SearchParamEffects({
  onOpenPublish,
  onApplyPreset,
}: {
  onOpenPublish: () => void
  onApplyPreset: (args: {
    presetId?: string | null
    uiStyleKit?: string | null
    themeId?: string | null
    prompt?: string | null
  }) => void
}) {
  const search = useSearchParams()
  const router = useRouter()

  useEffect(() => {
    const want = search.get("publish")
    if (want === "1") onOpenPublish()
  }, [search, onOpenPublish])

  useEffect(() => {
    const preset = search.get("preset")
    if (preset !== "1") return
    onApplyPreset({
      presetId: search.get("presetId"),
      uiStyleKit: search.get("uiStyleKit"),
      themeId: search.get("themeId"),
      prompt: search.get("prompt"),
    })
    router.replace("/")
  }, [search, router, onApplyPreset])

  return null
}

export default function BuilderPage() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  useEffect(() => {
    if (authLoading) return
    if (!user) router.replace("/login")
  }, [user, authLoading, router])

  if (!authLoading && !user) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-sm text-muted-foreground">
        Redirecting to sign in…
      </div>
    )
  }
  const [previewExpanded, setPreviewExpanded] = useState(false)
  const [hydrated, setHydrated] = useState(false)
  const syncRef = useRef<SyncEngine | null>(null)

  const [persisted, setPersisted] = useState<BuilderPersistedState>(() => createEmptyPersistedState())
  const [modelFiles, setModelFiles] = useState<Record<string, string>>({})
  const [hasGenerated, setHasGenerated] = useState(false)
  const [generatedTitle, setGeneratedTitle] = useState("")
  const [lastUserPrompt, setLastUserPrompt] = useState("")
  const [currentVersionId, setCurrentVersionId] = useState<string | null>(null)
  const currentVersionIdRef = useRef<string | null>(null)
  const [integrationsOpen, setIntegrationsOpen] = useState(false)
  const [integrationTab, setIntegrationTab] = useState<IntegrationTab>("supabase")
  const [publishOpen, setPublishOpen] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [polishing, setPolishing] = useState(false)

  const handleApplyPreset = useCallback(
    (args: { presetId?: string | null; uiStyleKit?: string | null; themeId?: string | null; prompt?: string | null }) => {
      const ui = args.uiStyleKit
      const theme = args.themeId
      const prompt = args.prompt

      try {
        if (ui) localStorage.setItem("buildai-ui-style-kit", ui)
        if (theme) localStorage.setItem("buildai-theme-id", theme)
      } catch {
        /* ignore */
      }

      if (prompt?.trim()) {
        // Seed the first prompt for non-technical users.
        // ChatPanel reads empty input state, so we store as a transient key.
        try {
          localStorage.setItem("buildai-seed-prompt", prompt)
        } catch {
          /* ignore */
        }
      }

      // Also: create a new project when template is selected.
      if (args.presetId) {
        const preset = getTemplatePresetById(args.presetId)
        if (preset) {
          const p = createProject(preset.title)
          setPersisted((prev) => ({
            ...prev,
            projects: [...prev.projects, p],
            activeProjectId: p.id,
          }))
          setModelFiles({})
          setHasGenerated(false)
          setGeneratedTitle("")
          setLastUserPrompt("")
          setCurrentVersionId(null)
          setSidebarCollapsed(false)
        }
      }
    },
    [],
  )

  useEffect(() => {
    currentVersionIdRef.current = currentVersionId
  }, [currentVersionId])

  useEffect(() => {
    let next = loadPersistedState()
    if (next.projects.length === 0) {
      const p = createProject("My first project")
      next = { ...next, projects: [p], activeProjectId: p.id }
      savePersistedState(next)
    }
    if (!next.activeProjectId && next.projects[0]) {
      next = { ...next, activeProjectId: next.projects[0].id }
    }
    setPersisted(next)
    const active = next.projects.find((p) => p.id === next.activeProjectId) ?? next.projects[0]
    if (active) {
      const last = active.versions[active.versions.length - 1]
      if (last) {
        setModelFiles(last.files)
        setCurrentVersionId(last.id)
        setHasGenerated(true)
        setLastUserPrompt(last.userPrompt)
        setGeneratedTitle(truncate(last.userPrompt, 40))
      }
    }
    setHydrated(true)

    // Kick off best-effort server sync (local-first).
    syncRef.current = new SyncEngine({
      onRemoteMerged: (merged) => {
        setPersisted(merged)
      },
    })
    void syncRef.current.pullAndMerge(next)
  }, [])

  useEffect(() => {
    if (!hydrated) return
    const t = window.setTimeout(() => savePersistedState(persisted), 400)
    return () => window.clearTimeout(t)
  }, [persisted, hydrated])

  useEffect(() => {
    if (!hydrated) return
    syncRef.current?.schedulePush(persisted)
  }, [persisted, hydrated])

  const activeProject = useMemo(
    () => persisted.projects.find((p) => p.id === persisted.activeProjectId) ?? null,
    [persisted.projects, persisted.activeProjectId],
  )

  const lastDeployment = useMemo(() => {
    if (!activeProject?.deployments?.length) return null
    return [...activeProject.deployments].sort((a, b) => b.createdAt - a.createdAt)[0] ?? null
  }, [activeProject])

  const sandpackFiles = useMemo(() => {
    const dotEnv = buildDotEnvFromSupabase(
      persisted.integrations.supabase?.url,
      persisted.integrations.supabase?.anonKey,
    )
    const { appTsx, extraFiles } = splitModelFiles(modelFiles)
    return buildSandpackFiles({ appTsx, extraFiles, dotEnv })
  }, [modelFiles, persisted.integrations.supabase])

  const versionIndex =
    activeProject && currentVersionId
      ? activeProject.versions.findIndex((v) => v.id === currentVersionId)
      : -1
  const versionLabel =
    activeProject && currentVersionId && versionIndex >= 0 ? `v${versionIndex + 1}` : undefined

  const handleChatThreadChange = useCallback((thread: BuilderChatMessage[]) => {
    setPersisted((prev) => {
      const pid = prev.activeProjectId
      if (!pid) return prev
      const ix = prev.projects.findIndex((p) => p.id === pid)
      if (ix < 0) return prev
      const projects = [...prev.projects]
      projects[ix] = { ...projects[ix], chatThread: thread, updatedAt: Date.now() }
      return { ...prev, projects }
    })
  }, [])

  const handleGenerateSuccess = useCallback((payload: ChatGenerateSuccess) => {
    const model: Record<string, string> = {
      "/App.tsx": payload.appTsx,
      ...(payload.extraFiles ?? {}),
    }
    setModelFiles(model)

    const pendingVersion = { current: null as string | null }
    setPersisted((prev) => {
      const pid = prev.activeProjectId
      if (!pid) return prev
      const ix = prev.projects.findIndex((p) => p.id === pid)
      if (ix < 0) return prev
      const prevProject = prev.projects[ix]
      const named =
        prevProject.name === "Untitled" || prevProject.name === "My first project"
          ? truncate(payload.userPrompt, 36) || prevProject.name
          : prevProject.name
      const withVersion = appendVersion(prevProject, {
        userPrompt: payload.userPrompt,
        assistantReply: payload.reply,
        files: model,
        ...(payload.approvedPlan !== undefined ? { approvedPlan: payload.approvedPlan } : {}),
        ...(payload.planClarifications !== undefined && payload.planClarifications.length > 0
          ? { planClarifications: payload.planClarifications }
          : {}),
      })
      const newVersion = withVersion.versions[withVersion.versions.length - 1]
      pendingVersion.current = newVersion.id
      const projects = [...prev.projects]
      projects[ix] = { ...withVersion, name: named }
      return { ...prev, projects }
    })
    if (pendingVersion.current) {
      setCurrentVersionId(pendingVersion.current)
    }
    setLastUserPrompt(payload.userPrompt)
    setHasGenerated(true)
    setGeneratedTitle(truncate(payload.userPrompt, 40))
  }, [])

  const handleNewProject = useCallback(() => {
    const p = createProject("Untitled")
    setPersisted((prev) => ({
      ...prev,
      projects: [...prev.projects, p],
      activeProjectId: p.id,
    }))
    setModelFiles({})
    setHasGenerated(false)
    setGeneratedTitle("")
    setLastUserPrompt("")
    setCurrentVersionId(null)
    setSidebarCollapsed(false)
  }, [])

  const handleSelectProject = useCallback(
    (id: string) => {
      const proj = persisted.projects.find((x) => x.id === id)
      setPersisted((prev) => ({ ...prev, activeProjectId: id }))
      if (!proj) return
      const last = proj.versions[proj.versions.length - 1]
      if (last) {
        setModelFiles(last.files)
        setCurrentVersionId(last.id)
        setHasGenerated(true)
        setLastUserPrompt(last.userPrompt)
        setGeneratedTitle(truncate(last.userPrompt, 40))
      } else {
        setModelFiles({})
        setHasGenerated(false)
        setGeneratedTitle("")
        setLastUserPrompt("")
        setCurrentVersionId(null)
      }
    },
    [persisted.projects],
  )

  const handleRestoreVersion = useCallback(
    (projectId: string, versionId: string) => {
      const p = persisted.projects.find((x) => x.id === projectId)
      const v = p?.versions.find((x) => x.id === versionId)
      if (!v) return
      setPersisted((prev) => ({ ...prev, activeProjectId: projectId }))
      setModelFiles(v.files)
      setCurrentVersionId(v.id)
      setHasGenerated(true)
      setLastUserPrompt(v.userPrompt)
      setGeneratedTitle(truncate(v.userPrompt, 40))
    },
    [persisted.projects],
  )

  const handleRefresh = useCallback(async () => {
    if (!lastUserPrompt.trim()) {
      toast.error("Nothing to refresh yet")
      return
    }
    setRefreshing(true)
    try {
      const proj = persisted.projects.find((p) => p.id === persisted.activeProjectId)
      const ver = proj?.versions.find((v) => v.id === currentVersionId)
      const approvedPlan = ver?.approvedPlan
      const planClarifications = ver?.planClarifications
      const messages =
        approvedPlan && ver?.assistantReply?.trim()
          ? [
              { role: "user" as const, content: lastUserPrompt },
              { role: "assistant" as const, content: ver.assistantReply.slice(0, 8000) },
              {
                role: "user" as const,
                content:
                  "Regenerate the full preview from scratch. Follow the approved plan and the assistant summary above; keep the same user intent.",
              },
            ]
          : [{ role: "user" as const, content: lastUserPrompt }]
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages,
          flags: { supabaseConfigured: Boolean(persisted.integrations.supabase) },
          ...(approvedPlan ? { approvedPlan } : {}),
          ...(planClarifications?.length ? { clarifications: planClarifications } : {}),
        }),
      })
      const data = (await res.json()) as GenerateResponse & { error?: string }
      if (!res.ok) throw new Error(data.error ?? "Regenerate failed")
      handleGenerateSuccess({
        reply: data.reply,
        userPrompt: lastUserPrompt,
        appTsx: data.appTsx,
        extraFiles: data.extraFiles,
        ...(approvedPlan !== undefined ? { approvedPlan } : {}),
        ...(planClarifications?.length ? { planClarifications } : {}),
      })
      toast.success(approvedPlan ? "Preview refreshed (using saved plan)" : "Preview refreshed")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Refresh failed")
    } finally {
      setRefreshing(false)
    }
  }, [
    lastUserPrompt,
    persisted.integrations.supabase,
    persisted.projects,
    persisted.activeProjectId,
    currentVersionId,
    handleGenerateSuccess,
  ])

  const handlePolish = useCallback(async () => {
    if (!hasGenerated) return
    const { appTsx: appBody, extraFiles } = splitModelFiles(modelFiles)
    if (!appBody?.trim()) {
      toast.error("Nothing to polish yet")
      return
    }
    setPolishing(true)
    try {
      const proj = persisted.projects.find((p) => p.id === persisted.activeProjectId)
      const ver = proj?.versions.find((v) => v.id === currentVersionId)
      const refineFrom = {
        appTsx: appBody,
        ...(Object.keys(extraFiles).length > 0 ? { extraFiles } : {}),
      }
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            {
              role: "user",
              content:
                "Polish the live preview: improve spacing, responsive grids, typography, and accessibility. Do not remove features or change business logic.",
            },
          ],
          flags: { supabaseConfigured: Boolean(persisted.integrations.supabase) },
          ...(ver?.approvedPlan ? { approvedPlan: ver.approvedPlan } : {}),
          ...(ver?.planClarifications?.length ? { clarifications: ver.planClarifications } : {}),
          refineFrom,
        }),
      })
      const data = (await res.json()) as GenerateResponse & { error?: string }
      if (!res.ok) throw new Error(data.error ?? "Polish failed")
      handleGenerateSuccess({
        reply: data.reply,
        userPrompt: lastUserPrompt || "UI polish",
        appTsx: data.appTsx,
        extraFiles: data.extraFiles,
        ...(ver?.approvedPlan !== undefined ? { approvedPlan: ver.approvedPlan } : {}),
        ...(ver?.planClarifications !== undefined && ver.planClarifications.length > 0
          ? { planClarifications: ver.planClarifications }
          : {}),
      })
      toast.success("Preview polished")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Polish failed")
    } finally {
      setPolishing(false)
    }
  }, [
    hasGenerated,
    modelFiles,
    persisted.projects,
    persisted.activeProjectId,
    persisted.integrations.supabase,
    currentVersionId,
    lastUserPrompt,
    handleGenerateSuccess,
  ])

  const handlePreviewSourcesPatched = useCallback((patched: Record<string, string>) => {
    setModelFiles((prev) => ({ ...prev, ...patched }))
    const vid = currentVersionIdRef.current
    if (!vid) return
    setPersisted((prev) => {
      const pid = prev.activeProjectId
      if (!pid) return prev
      const pix = prev.projects.findIndex((p) => p.id === pid)
      if (pix < 0) return prev
      const proj = prev.projects[pix]
      const vix = proj.versions.findIndex((v) => v.id === vid)
      if (vix < 0) return prev
      const v = proj.versions[vix]
      const newFiles = { ...v.files, ...patched }
      const versions = [...proj.versions]
      versions[vix] = { ...v, files: newFiles }
      const projects = [...prev.projects]
      projects[pix] = { ...proj, versions }
      return { ...prev, projects }
    })
    toast.success("Preview: auto-fixed <= / >= in JSX text (Unicode ≤ ≥)")
  }, [])

  const openIntegrations = useCallback((tab: IntegrationTab = "supabase") => {
    setIntegrationTab(tab)
    setIntegrationsOpen(true)
    setSidebarCollapsed(false)
  }, [])

  return (
    <div className="h-[100dvh] flex flex-col overflow-hidden">
      <Suspense fallback={null}>
        <SearchParamEffects
          onOpenPublish={() => setPublishOpen(true)}
          onApplyPreset={handleApplyPreset}
        />
      </Suspense>
      <Header />

      <IntegrationsDialog
        open={integrationsOpen}
        onOpenChange={setIntegrationsOpen}
        initialTab={integrationTab}
        integrations={persisted.integrations}
        onSave={(next) => setPersisted((p) => ({ ...p, integrations: next }))}
      />
      <PublishDialog
        open={publishOpen}
        onOpenChange={setPublishOpen}
        defaultSiteName={generatedTitle || "BuildAI Site"}
        modelFiles={modelFiles}
        integrations={persisted.integrations}
        projectId={persisted.activeProjectId}
        versionId={currentVersionId}
        onPublished={(deployment: BuilderDeployment) => {
          setPersisted((prev) => {
            const pid = prev.activeProjectId
            if (!pid) return prev
            const ix = prev.projects.findIndex((p) => p.id === pid)
            if (ix < 0) return prev
            const proj = prev.projects[ix]
            const nextDeployments = [...(proj.deployments ?? []), deployment]
            const projects = [...prev.projects]
            projects[ix] = { ...proj, deployments: nextDeployments, updatedAt: Date.now() }
            return { ...prev, projects }
          })
        }}
      />

      <div className="flex-1 flex overflow-hidden min-h-0">
        <ProjectSidebar
          collapsed={sidebarCollapsed}
          projects={persisted.projects}
          activeProjectId={persisted.activeProjectId}
          integrations={persisted.integrations}
          onNewProject={handleNewProject}
          onSelectProject={handleSelectProject}
          onRestoreVersion={handleRestoreVersion}
          onOpenIntegrations={openIntegrations}
          onExpand={() => setSidebarCollapsed(false)}
        />

        <div className="relative z-0 flex-1 flex flex-col lg:flex-row overflow-hidden min-h-0 min-w-0 isolate">
          <div className="shrink-0 border-b border-border bg-background/60 backdrop-blur-sm flex items-center justify-between px-2 py-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {sidebarCollapsed ? <PanelLeft className="size-4" /> : <PanelLeftClose className="size-4" />}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              disabled={!hasGenerated}
              onClick={() => setPreviewExpanded(!previewExpanded)}
              aria-label={previewExpanded ? "Minimize preview pane" : "Expand preview pane"}
            >
              {previewExpanded ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
            </Button>
          </div>

          <div
            className={cn(
              "relative z-0 bg-background flex-1 min-w-0 border-r border-border transition-all duration-300 min-h-0 flex flex-col",
              previewExpanded ? "hidden lg:flex lg:w-[400px] lg:min-w-[400px] lg:max-w-[400px]" : "lg:w-1/2 lg:max-w-[50%]",
            )}
          >
            {(() => {
              const proj = persisted.projects.find((p) => p.id === persisted.activeProjectId)
              const ver = proj?.versions.find((v) => v.id === currentVersionId)
              const { appTsx: appBody, extraFiles } = splitModelFiles(modelFiles)
              const refineFrom =
                appBody?.trim() ? { appTsx: appBody, ...(Object.keys(extraFiles).length ? { extraFiles } : {}) } : null
              return (
            <ChatPanel
              key={persisted.activeProjectId ?? "none"}
              projectKey={persisted.activeProjectId ?? "none"}
              initialChatThread={activeProject?.chatThread ?? []}
              onChatThreadChange={handleChatThreadChange}
              supabaseConfigured={Boolean(persisted.integrations.supabase)}
              onOpenIntegrations={() => openIntegrations("supabase")}
              onGenerateSuccess={handleGenerateSuccess}
              hasGenerated={hasGenerated}
              refineFrom={refineFrom}
              currentApprovedPlan={ver?.approvedPlan}
              currentClarifications={ver?.planClarifications}
            />
              )
            })()}
          </div>

          <div
            className={cn(
              "relative z-0 bg-background flex-1 min-w-0 transition-all duration-300 min-h-0 flex flex-col",
              previewExpanded ? "w-full" : "lg:w-1/2 lg:max-w-[50%]",
            )}
          >
            <PreviewPanel
              hasGenerated={hasGenerated}
              title={generatedTitle}
              versionLabel={versionLabel}
              lastDeployment={lastDeployment}
              versionPicker={
                activeProject && activeProject.versions.length > 0
                  ? {
                      versions: activeProject.versions.map((v, i) => ({
                        id: v.id,
                        label: `v${i + 1}`,
                        subtitle: truncate(v.userPrompt, 48),
                      })),
                      currentVersionId:
                        currentVersionId ?? activeProject.versions[activeProject.versions.length - 1]?.id ?? null,
                      onSelectVersion: (vid) => handleRestoreVersion(activeProject.id, vid),
                    }
                  : undefined
              }
              sandpackMountKey={currentVersionId}
              sandpackFiles={sandpackFiles}
              onRefresh={hasGenerated ? handleRefresh : undefined}
              refreshing={refreshing}
              onPolish={hasGenerated ? handlePolish : undefined}
              polishing={polishing}
              onToggleExpand={hasGenerated ? () => setPreviewExpanded(!previewExpanded) : undefined}
              previewExpanded={previewExpanded}
              onPublish={hasGenerated ? () => setPublishOpen(true) : undefined}
              onPreviewSourcesPatched={hasGenerated ? handlePreviewSourcesPatched : undefined}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

function truncate(s: string, max: number): string {
  const t = s.trim()
  if (t.length <= max) return t
  return `${t.slice(0, max - 1)}…`
}
