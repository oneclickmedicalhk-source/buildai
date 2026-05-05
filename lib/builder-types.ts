/** Domain types for the builder: projects, versions, and integration flags. */

import type { PlanSnapshot } from "@/lib/plan-schema"

/** One persisted chat bubble (no transient generating flags). */
export interface BuilderChatMessage {
  id: string
  role: "user" | "assistant"
  content: string
  ts: number
  plan?: PlanSnapshot
}

export interface BuilderVersion {
  id: string
  createdAt: number
  userPrompt: string
  assistantReply: string
  /** Sandpack file map: path -> source (user / AI paths only; bootstrap merged separately). */
  files: Record<string, string>
  /** Snapshot from plan phase; used for Regenerate with same spec. */
  approvedPlan?: PlanSnapshot
  /** User chip answers at build time; replayed on Regenerate when present. */
  planClarifications?: { questionId: string; answer: string }[]
}

export interface BuilderDeployment {
  id: string
  createdAt: number
  versionId: string | null
  siteName: string
  repoName: string
  repoUrl: string
  url: string
  vercelDeploymentId?: string
}

export interface BuilderProject {
  id: string
  name: string
  updatedAt: number
  versions: BuilderVersion[]
  deployments?: BuilderDeployment[]
  /** Saved chat for this project; restored when switching back from another project. */
  chatThread?: BuilderChatMessage[]
}

export interface SupabaseIntegration {
  url: string
  anonKey: string
}

export interface BuilderIntegrations {
  supabase: SupabaseIntegration | null
  vercelConnected: boolean
  stripeConnected: boolean
}

export interface BuilderPersistedState {
  version: 1
  activeProjectId: string | null
  projects: BuilderProject[]
  integrations: BuilderIntegrations
}
