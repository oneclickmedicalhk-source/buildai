import type {
  BuilderIntegrations,
  BuilderPersistedState,
  BuilderProject,
  BuilderVersion,
} from "@/lib/builder-types"

export const BUILDER_STORAGE_KEY = "buildai:v1"

function defaultIntegrations(): BuilderIntegrations {
  return {
    supabase: null,
    vercelConnected: false,
    stripeConnected: false,
  }
}

export function createEmptyPersistedState(): BuilderPersistedState {
  return {
    version: 1,
    activeProjectId: null,
    projects: [],
    integrations: defaultIntegrations(),
  }
}

export function loadPersistedState(): BuilderPersistedState {
  if (typeof window === "undefined") {
    return createEmptyPersistedState()
  }
  try {
    const raw = window.localStorage.getItem(BUILDER_STORAGE_KEY)
    if (!raw) return createEmptyPersistedState()
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== "object") return createEmptyPersistedState()
    const o = parsed as Partial<BuilderPersistedState>
    if (o.version !== 1 || !Array.isArray(o.projects)) {
      return createEmptyPersistedState()
    }
    return {
      version: 1,
      activeProjectId:
        typeof o.activeProjectId === "string" || o.activeProjectId === null
          ? o.activeProjectId
          : null,
      projects: (o.projects as BuilderProject[]).map((p) => ({
        ...p,
        deployments: Array.isArray((p as BuilderProject).deployments) ? (p as BuilderProject).deployments : [],
      })),
      integrations: {
        ...defaultIntegrations(),
        ...(o.integrations ?? {}),
      },
    }
  } catch {
    return createEmptyPersistedState()
  }
}

export function savePersistedState(state: BuilderPersistedState): void {
  if (typeof window === "undefined") return
  window.localStorage.setItem(BUILDER_STORAGE_KEY, JSON.stringify(state))
}

export function newProjectId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `p-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export function newVersionId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `v-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export function createProject(name: string): BuilderProject {
  const now = Date.now()
  return {
    id: newProjectId(),
    name: name.trim() || "Untitled",
    updatedAt: now,
    versions: [],
    deployments: [],
    chatThread: [],
  }
}

export function appendVersion(
  project: BuilderProject,
  version: Omit<BuilderVersion, "id" | "createdAt"> &
    Partial<Pick<BuilderVersion, "id" | "createdAt">>,
): BuilderProject {
  const v: BuilderVersion = {
    id: version.id ?? newVersionId(),
    createdAt: version.createdAt ?? Date.now(),
    userPrompt: version.userPrompt,
    assistantReply: version.assistantReply,
    files: version.files,
    ...(version.approvedPlan !== undefined ? { approvedPlan: version.approvedPlan } : {}),
    ...(version.planClarifications !== undefined && version.planClarifications.length > 0
      ? { planClarifications: version.planClarifications }
      : {}),
  }
  return {
    ...project,
    updatedAt: v.createdAt,
    versions: [...project.versions, v],
  }
}
