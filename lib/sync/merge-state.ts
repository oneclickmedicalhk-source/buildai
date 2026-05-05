import type { BuilderPersistedState, BuilderProject } from "@/lib/builder-types"

function mergeProjects(local: BuilderProject[], remote: BuilderProject[]): BuilderProject[] {
  const byId = new Map<string, BuilderProject>()
  for (const p of local) byId.set(p.id, p)
  for (const p of remote) {
    const existing = byId.get(p.id)
    if (!existing) {
      byId.set(p.id, p)
      continue
    }
    byId.set(p.id, p.updatedAt >= existing.updatedAt ? p : existing)
  }
  return [...byId.values()].sort((a, b) => b.updatedAt - a.updatedAt)
}

/**
 * Local-first merge:
 * - Projects: choose the newer `updatedAt` per project id
 * - Integrations: keep local (safer; avoids overwriting keys)
 * - activeProjectId: keep local if it still exists, else fall back to a remote project
 */
export function mergeLocalAndRemoteState(
  local: BuilderPersistedState,
  remote: BuilderPersistedState,
): BuilderPersistedState {
  const projects = mergeProjects(local.projects, remote.projects)
  const hasLocalActive = local.activeProjectId && projects.some((p) => p.id === local.activeProjectId)
  const nextActive =
    hasLocalActive ? local.activeProjectId : projects[0]?.id ?? remote.activeProjectId ?? null

  return {
    version: 1,
    activeProjectId: nextActive,
    projects,
    integrations: local.integrations,
  }
}

