"use client"

import { useMemo, useState } from "react"
import { formatDistanceToNow } from "date-fns"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  Plus,
  FolderOpen,
  FileCode2,
  Database,
  Cloud,
  ChevronRight,
  Sparkles,
  History,
  Settings,
  Layers,
  ClipboardList,
} from "lucide-react"
import { cn } from "@/lib/utils"
import type { BuilderIntegrations, BuilderProject } from "@/lib/builder-types"
import type { IntegrationTab } from "@/components/integrations-dialog"

function CreditCard({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
      <line x1="1" y1="10" x2="23" y2="10" />
    </svg>
  )
}

export function ProjectSidebar({
  collapsed = false,
  projects,
  activeProjectId,
  integrations,
  onNewProject,
  onSelectProject,
  onRestoreVersion,
  onOpenIntegrations,
  onExpand,
}: {
  collapsed?: boolean
  projects: BuilderProject[]
  activeProjectId: string | null
  integrations: BuilderIntegrations
  onNewProject: () => void
  onSelectProject: (id: string) => void
  onRestoreVersion: (projectId: string, versionId: string) => void
  onOpenIntegrations: (tab?: IntegrationTab) => void
  onExpand: () => void
}) {
  const [projectsOpen, setProjectsOpen] = useState(true)
  const [integrationsOpen, setIntegrationsOpen] = useState(true)
  const [historyOpen, setHistoryOpen] = useState(true)

  const activeProject = projects.find((p) => p.id === activeProjectId) ?? null

  const sortedProjects = useMemo(
    () => [...projects].sort((a, b) => b.updatedAt - a.updatedAt),
    [projects],
  )

  const integrationRows = [
    {
      name: "Supabase",
      icon: Database,
      connected: Boolean(integrations.supabase),
      color: "text-emerald-500",
    },
    {
      name: "Vercel",
      icon: Cloud,
      connected: integrations.vercelConnected,
      color: "text-foreground",
    },
    {
      name: "Stripe",
      icon: CreditCard,
      connected: integrations.stripeConnected,
      color: "text-muted-foreground",
    },
  ] as const

  if (collapsed) {
    return (
      <div className="relative z-20 w-14 border-r border-border bg-sidebar flex flex-col items-center py-4 gap-2 shrink-0">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" variant="ghost" size="sm" className="h-10 w-10 p-0" onClick={onNewProject}>
                <Plus className="size-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">New project</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" variant="ghost" size="sm" className="h-10 w-10 p-0" onClick={onExpand}>
                <FolderOpen className="size-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">Expand projects</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-10 w-10 p-0"
                onClick={() => {
                  onExpand()
                  onOpenIntegrations("supabase")
                }}
              >
                <Database className="size-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">Integrations</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" variant="ghost" size="sm" className="h-10 w-10 p-0" onClick={onExpand}>
                <History className="size-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">Version history</TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <div className="flex-1" />
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" variant="ghost" size="sm" className="h-10 w-10 p-0" disabled>
                <Settings className="size-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">Settings (soon)</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    )
  }

  return (
    <div className="w-64 border-r border-border bg-sidebar flex flex-col shrink-0 min-h-0 min-w-0 max-w-64 overflow-x-hidden z-20 relative">
      <div className="p-3 border-b border-sidebar-border">
        <Button
          type="button"
          className="w-full gap-2 bg-accent text-accent-foreground hover:bg-accent/90"
          onClick={onNewProject}
        >
          <Plus className="size-4" />
          New project
        </Button>
      </div>

      <ScrollArea className="flex-1 min-h-0 min-w-0">
        {/* Extra right padding so Radix scroll thumb does not cover row actions (badges/buttons). */}
        <div className="space-y-4 py-3 pl-3 pr-10 pb-6 max-w-full">
          <Collapsible open={projectsOpen} onOpenChange={setProjectsOpen}>
            <CollapsibleTrigger className="flex items-center justify-between w-full group">
              <div className="flex items-center gap-2 text-sm font-medium">
                <ChevronRight
                  className={cn("size-4 transition-transform", projectsOpen && "rotate-90")}
                />
                <FolderOpen className="size-4" />
                Projects
              </div>
              <Badge variant="secondary" className="text-xs">
                {projects.length}
              </Badge>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2 space-y-1">
              {sortedProjects.map((project) => (
                <button
                  key={project.id}
                  type="button"
                  onClick={() => onSelectProject(project.id)}
                  className={cn(
                    "w-full flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-sidebar-accent transition-colors text-left group",
                    project.id === activeProjectId && "bg-sidebar-accent",
                  )}
                >
                  <FileCode2 className="size-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm truncate">{project.name}</span>
                      {project.id === activeProjectId && integrations.supabase ? (
                        <span className="inline-flex" title="Supabase configured">
                          <Database className="size-3 text-accent shrink-0" />
                        </span>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>v{project.versions.length}</span>
                      <span>•</span>
                      <span>{formatDistanceToNow(project.updatedAt, { addSuffix: true })}</span>
                    </div>
                  </div>
                </button>
              ))}
            </CollapsibleContent>
          </Collapsible>

          {activeProject ? (
            <Collapsible open={historyOpen} onOpenChange={setHistoryOpen}>
              <CollapsibleTrigger className="flex items-center justify-between w-full group">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <ChevronRight
                    className={cn("size-4 transition-transform", historyOpen && "rotate-90")}
                  />
                  <History className="size-4" />
                  History
                </div>
                <Badge variant="secondary" className="text-xs">
                  {activeProject.versions.length}
                </Badge>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-2 space-y-1 max-h-48 overflow-y-auto">
                {[...activeProject.versions].reverse().map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    className="w-full text-left px-2 py-1.5 rounded-md hover:bg-sidebar-accent text-xs"
                    onClick={() => onRestoreVersion(activeProject.id, v.id)}
                  >
                    <div className="flex items-start gap-1.5">
                      <div className="truncate font-medium flex-1 min-w-0">{v.userPrompt}</div>
                      {v.approvedPlan ? (
                        <ClipboardList
                          className="size-3.5 shrink-0 text-accent mt-0.5"
                          aria-label="Version has saved plan"
                        />
                      ) : null}
                    </div>
                    <div className="text-muted-foreground">
                      {formatDistanceToNow(v.createdAt, { addSuffix: true })}
                    </div>
                  </button>
                ))}
              </CollapsibleContent>
            </Collapsible>
          ) : null}

          <Collapsible open={integrationsOpen} onOpenChange={setIntegrationsOpen}>
            <CollapsibleTrigger className="flex items-center justify-between w-full group">
              <div className="flex items-center gap-2 text-sm font-medium">
                <ChevronRight
                  className={cn("size-4 transition-transform", integrationsOpen && "rotate-90")}
                />
                <Layers className="size-4" />
                Integrations
              </div>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2 space-y-1">
              {integrationRows.map((row) => (
                <button
                  key={row.name}
                  type="button"
                  className="w-full max-w-full flex items-center gap-2 px-2 py-2 pr-2 rounded-lg hover:bg-sidebar-accent transition-colors text-left min-w-0 overflow-hidden"
                  onClick={() =>
                    onOpenIntegrations(
                      row.name === "Supabase" ? "supabase" : row.name === "Vercel" ? "vercel" : "stripe",
                    )
                  }
                >
                  <row.icon className={cn("size-4 shrink-0", row.color)} />
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="text-sm min-w-0 truncate">{row.name}</span>
                    {row.connected ? (
                      <Badge
                        variant="secondary"
                        className="shrink-0 text-[10px] sm:text-xs bg-accent/20 text-accent border-0 max-w-[4.5rem] truncate px-1.5 text-center"
                        title="Connected"
                      >
                        OK
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="shrink-0 text-[10px] sm:text-xs max-w-[4.5rem] truncate px-1.5 text-center"
                        title="Open setup"
                      >
                        Set up
                      </Badge>
                    )}
                  </div>
                </button>
              ))}
            </CollapsibleContent>
          </Collapsible>
        </div>
      </ScrollArea>

      <div className="p-3 border-t border-sidebar-border shrink-0 bg-sidebar">
        <div className="flex items-center gap-2 px-2 py-2 rounded-lg bg-accent/10 min-w-0">
          <Sparkles className="size-4 text-accent" />
          <div className="flex-1">
            <p className="text-xs font-medium">Local mode</p>
            <p className="text-xs text-muted-foreground">Projects saved in this browser</p>
          </div>
        </div>
      </div>
    </div>
  )
}
