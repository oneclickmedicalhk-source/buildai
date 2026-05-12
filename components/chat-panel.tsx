"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  Send,
  Paperclip,
  Sparkles,
  Code2,
  Image as ImageIcon,
  Database,
  Loader2,
  User,
  Bot,
  Copy,
  Check,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import type { GenerateResponse } from "@/lib/ai-generate-schema"
import type { PlanResponse } from "@/lib/plan-schema"
import type { PlanSnapshot } from "@/lib/plan-schema"
import { PlanReviewCard } from "@/components/plan-review-card"
import { PlanQuestionsCard } from "@/components/plan-questions-card"
import { useAiPreferences } from "@/components/ai-preferences-context"
import { useI18n } from "@/components/i18n-context"
import { useAuth } from "@/components/auth-context"
import type { BuilderChatMessage } from "@/lib/builder-types"
import type { UiStyleKitId } from "@/lib/ui-style-kit"
import type { ThemeId } from "@/lib/theme/theme-types"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { TopUpDialog } from "@/components/topup-dialog"

interface Message {
  id: string
  role: "user" | "assistant"
  content: string
  timestamp: Date
  isGenerating?: boolean
  generatingLabel?: "planning" | "building"
  generatingStage?:
    | "planning_request"
    | "planning_parse"
    | "waiting_confirm"
    | "codegen_request"
    | "codegen_parse"
    | "done"
  generatedComponent?: boolean
  changedFiles?: string[]
  /** When set, this assistant turn is a plan awaiting user confirmation. */
  plan?: PlanSnapshot
  planStage?: "questions" | "review"
  activity?: { id: string; label: string; status: "pending" | "active" | "done" | "error"; detail?: string }[]
}

type PreviewBundleApiResponse = {
  js?: string
  css?: string
  error?: string
  patchedFiles?: Record<string, string>
}

type ResumePayload = {
  kind: "confirm_build" | "quick_build" | "patch_edit"
  projectKey: string
  userGoal: string
  history: { role: "user" | "assistant"; content: string; ts: number }[]
  opts?: {
    approvedPlan?: PlanSnapshot
    clarifications?: { questionId: string; answer: string }[]
    refineFrom?: { appTsx: string; extraFiles?: Record<string, string> } | null
    refineKind?: "polish" | "edit"
    editOutput?: "auto" | "full" | "patch"
  }
  ts: number
}

type ApiBilling = {
  phase: "plan" | "generate" | "edit" | "runtime_repair"
  preauthUsd: number
  chargedUsd: number
  uncappedChargedUsd: number
  firstBuildDiscountUsd?: number
  firstBuildCapApplied?: boolean
}

const RESUME_STORAGE_KEY = "buildai-resume-payload"

function safeReadResumePayload(projectKey: string): ResumePayload | null {
  try {
    const raw = localStorage.getItem(RESUME_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as ResumePayload
    if (!parsed || typeof parsed !== "object") return null
    if (parsed.projectKey !== projectKey) return null
    if (!parsed.userGoal || typeof parsed.userGoal !== "string") return null
    if (!parsed.ts || typeof parsed.ts !== "number") return null
    if (!Array.isArray(parsed.history) || parsed.history.length === 0) return null
    return parsed
  } catch {
    return null
  }
}

function safeWriteResumePayload(payload: ResumePayload): void {
  try {
    localStorage.setItem(RESUME_STORAGE_KEY, JSON.stringify(payload))
  } catch {
    /* ignore */
  }
}

function safeClearResumePayload(): void {
  try {
    localStorage.removeItem(RESUME_STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

function normalizePreviewFiles(appTsx: string, extraFiles?: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = { "/App.tsx": appTsx }
  for (const [k, v] of Object.entries(extraFiles ?? {})) {
    if (typeof v !== "string") continue
    const key = k.startsWith("/") ? k : `/${k}`
    out[key] = v
  }
  return out
}

function buildFallbackErrorAppTsx(args: { title: string; detail: string }): string {
  const title = args.title.replace(/</g, "&lt;").replace(/>/g, "&gt;")
  const detail = args.detail.replace(/</g, "&lt;").replace(/>/g, "&gt;")
  return `export default function App() {
  return (
    <div style={{ padding: 24, fontFamily: "ui-sans-serif, system-ui" }}>
      <h1 style={{ fontSize: 18, fontWeight: 700 }}>${title}</h1>
      <p style={{ marginTop: 8, color: "#555", whiteSpace: "pre-wrap" }}>${detail}</p>
    </div>
  )
}
`
}

function GeneratingStatus({
  label,
  stage,
  activity,
}: {
  label?: "planning" | "building"
  stage?: Message["generatingStage"]
  activity?: Message["activity"]
}) {
  const { t } = useI18n()
  const segmentByStage: Partial<
    Record<
      NonNullable<Message["generatingStage"]>,
      { start: number; end: number; etaMs: number }
    >
  > = {
    planning_request: { start: 0, end: 20, etaMs: 6000 },
    planning_parse: { start: 20, end: 45, etaMs: 8000 },
    waiting_confirm: { start: 45, end: 55, etaMs: 6000 },
    codegen_request: { start: 55, end: 75, etaMs: 20000 },
    codegen_parse: { start: 75, end: 95, etaMs: 20000 },
    done: { start: 95, end: 100, etaMs: 600 },
  }
  const percentByStage: Partial<Record<NonNullable<Message["generatingStage"]>, number>> = {
    planning_request: 20,
    planning_parse: 45,
    waiting_confirm: 55,
    codegen_request: 75,
    codegen_parse: 95,
    done: 100,
  }
  const lines: Record<
    NonNullable<Message["generatingStage"]>,
    { title: string; detail?: string }
  > = {
    planning_request: {
      title: t("chat_status_planning_request_title"),
      detail: t("chat_status_planning_request_detail"),
    },
    planning_parse: {
      title: t("chat_status_planning_parse_title"),
      detail: t("chat_status_planning_parse_detail"),
    },
    waiting_confirm: {
      title: t("chat_status_waiting_confirm_title"),
      detail: t("chat_status_waiting_confirm_detail"),
    },
    codegen_request: {
      title: t("chat_status_codegen_request_title"),
      detail: t("chat_status_codegen_request_detail"),
    },
    codegen_parse: {
      title: t("chat_status_codegen_parse_title"),
      detail: t("chat_status_codegen_parse_detail"),
    },
  }

  const fallback =
    label === "planning"
      ? { title: t("chat_status_planning_request_title"), detail: t("chat_status_planning_request_detail") }
      : { title: t("chat_status_codegen_request_title"), detail: t("chat_status_codegen_request_detail") }

  const cur = stage && stage in lines ? lines[stage as Exclude<Message["generatingStage"], "done">] : fallback
  const targetPct = stage ? percentByStage[stage] : undefined
  const [displayPct, setDisplayPct] = useState<number>(1)
  const segRef = useRef<{
    stage: Message["generatingStage"] | undefined
    startTs: number
    startPct: number
    endPct: number
    etaMs: number
  } | null>(null)

  useEffect(() => {
    // ETA-based smooth progress: distribute percent growth over time, never stalling.
    const seg = stage ? segmentByStage[stage] : undefined
    const endPct = stage === "done" ? 100 : seg?.end ?? Math.max(displayPct, targetPct ?? (label === "planning" ? 55 : 90))
    const etaMs = seg?.etaMs ?? 18000
    if (!segRef.current || segRef.current.stage !== stage) {
      segRef.current = {
        stage,
        startTs: Date.now(),
        startPct: Math.max(1, Math.min(95, displayPct)),
        endPct: Math.max(1, Math.min(100, endPct)),
        etaMs: Math.max(300, etaMs),
      }
    } else {
      // If stage hasn't changed, allow endPct to drift upward a bit (prevents plateau).
      segRef.current.endPct = Math.min(95, Math.max(segRef.current.endPct, endPct))
    }

    let raf = 0
    const tick = () => {
      setDisplayPct((prev) => {
        const s = segRef.current
        if (!s) return prev
        if (stage === "done") return 100
        const now = Date.now()
        const elapsed = Math.max(0, now - s.startTs)
        const t = Math.min(1, elapsed / s.etaMs)
        const ease = 1 - Math.pow(1 - t, 2) // ease-out
        let next = s.startPct + (s.endPct - s.startPct) * ease

        // After reaching the segment end, keep slowly creeping (up to +4%) while waiting.
        if (t >= 1 && prev >= s.endPct - 0.01) {
          const creepMax = Math.min(95, s.endPct + 4)
          const extra = elapsed - s.etaMs
          const creep = (creepMax - s.endPct) * (1 - Math.exp(-extra / 12000))
          next = s.endPct + creep
        }

        next = Math.max(prev, next)
        next = Math.min(95, next)
        return Math.round(next)
      })
      raf = window.requestAnimationFrame(tick)
    }
    raf = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(raf)
  }, [stage, label, targetPct])

  const title = `${cur.title} (${displayPct}%)`

  return (
    <div className="space-y-1 text-sm">
      <p className="flex items-center gap-2">
        <Loader2 className="size-4 animate-spin shrink-0" />
        {title}
      </p>
      {cur.detail ? <p className="text-xs text-muted-foreground pl-6">{cur.detail}</p> : null}
      {activity?.length ? (
        <div className="pt-2 space-y-1">
          {activity.map((a) => (
            <div key={a.id} className="flex items-start gap-2 text-xs">
              <span className="mt-0.5">
                {a.status === "done" ? "✓" : a.status === "error" ? "!" : "•"}
              </span>
              <div className="min-w-0">
                <div className={cn(a.status === "error" ? "text-destructive" : "text-foreground/90")}>
                  {a.label}
                </div>
                {a.detail ? <div className="text-muted-foreground break-words">{a.detail}</div> : null}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

const SUGGESTIONS = [
  "Make a simple website for my business (home, services, contact, WhatsApp button).",
  "Create a landing page for my new product (features, pricing, FAQ, contact).",
  "Build a page for booking appointments (choose service, pick time, confirmation).",
  "Make a restaurant website (menu, opening hours, location map, contact).",
  "Create an event page (schedule, speakers, ticket button, location).",
  "Build a small online store (product list, product page, cart).",
]

const SUGGESTIONS_ZH_HK = [
  "整一個簡單公司網站（首頁、服務、聯絡、WhatsApp 按鈕）。",
  "整一個產品介紹頁（功能、價錢、常見問題、聯絡）。",
  "整一個預約頁（揀服務、揀時間、確認訊息）。",
  "整一個餐廳網站（餐牌、營業時間、地圖、聯絡）。",
  "整一個活動宣傳頁（流程、講者、購票按鈕、地點）。",
  "整一個簡單網店（產品列表、產品頁、購物車）。",
]

const FALLBACK_PREVIEW_APP_TSX = `export default function App() {
  return (
    <div style={{ padding: 24, fontFamily: "ui-sans-serif, system-ui" }}>
      <h1 style={{ fontSize: 18, fontWeight: 700 }}>Preview unavailable</h1>
      <p style={{ marginTop: 8, color: "#555" }}>
        The AI reply was received, but the generated preview code was empty. Please try again.
      </p>
    </div>
  )
}
`

export interface ChatGenerateSuccess {
  reply: string
  userPrompt: string
  appTsx: string
  extraFiles?: Record<string, string>
  changedFiles?: string[]
  approvedPlan?: PlanSnapshot
  planClarifications?: { questionId: string; answer: string }[]
}

function hydrateThread(rows: BuilderChatMessage[] | undefined): Message[] {
  if (!rows?.length) return []
  return rows.map((r) => ({
    id: r.id,
    role: r.role,
    content: r.content,
    timestamp: new Date(r.ts),
    ...(r.plan ? { plan: r.plan } : {}),
    ...(r.planStage ? { planStage: r.planStage } : {}),
  }))
}

function serializeThread(msgs: Message[]): BuilderChatMessage[] {
  return msgs
    .filter((m) => !m.isGenerating && (m.content.trim().length > 0 || m.plan != null))
    .map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      ts: m.timestamp.getTime(),
      ...(m.plan ? { plan: m.plan } : {}),
      ...(m.planStage ? { planStage: m.planStage } : {}),
    }))
}

export function ChatPanel({
  projectKey,
  initialChatThread,
  onChatThreadChange,
  supabaseConfigured,
  onOpenIntegrations,
  onGenerateSuccess,
  hasGenerated,
  canRefineExisting,
  refineFrom,
  currentApprovedPlan,
  currentClarifications,
}: {
  projectKey: string
  initialChatThread?: BuilderChatMessage[]
  onChatThreadChange?: (thread: BuilderChatMessage[]) => void
  supabaseConfigured: boolean
  onOpenIntegrations: () => void
  onGenerateSuccess: (payload: ChatGenerateSuccess) => void
  hasGenerated: boolean
  canRefineExisting?: boolean
  refineFrom?: { appTsx: string; extraFiles?: Record<string, string> } | null
  currentApprovedPlan?: PlanSnapshot
  currentClarifications?: { questionId: string; answer: string }[]
}) {
  const [messages, setMessages] = useState<Message[]>(() => hydrateThread(initialChatThread))
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [quickBuild, setQuickBuild] = useState(false)
  const [replan, setReplan] = useState(false)
  const { aiProvider, uiStyleKit, setUiStyleKit, themeId, setThemeId, themeVariantId, setThemeVariantId } =
    useAiPreferences()
  const { lang, t } = useI18n()
  const { accessToken, refreshBalance } = useAuth()
  const [appearanceOpen, setAppearanceOpen] = useState(false)
  const [topupOpen, setTopupOpen] = useState(false)
  const [resumePayload, setResumePayload] = useState<ResumePayload | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const messagesRef = useRef<Message[]>([])
  /** Last user goal text for the active plan → build pipeline. */
  const pendingGoalRef = useRef<string>("")
  const pendingPlanMessageIdRef = useRef<string | null>(null)
  const lastScrolledPlanIdRef = useRef<string | null>(null)

  messagesRef.current = messages

  useEffect(() => {
    const p = safeReadResumePayload(projectKey)
    if (!p) return
    if (Date.now() - p.ts > 24 * 60 * 60 * 1000) {
      safeClearResumePayload()
      return
    }
    setResumePayload(p)
  }, [projectKey])

  useEffect(() => {
    if (messages.length > 0) return
    try {
      const seeded = localStorage.getItem("buildai-seed-prompt")
      if (seeded?.trim()) {
        localStorage.removeItem("buildai-seed-prompt")
        setInput(seeded)
        textareaRef.current?.focus()
      }
    } catch {
      /* ignore */
    }
  }, [messages.length])

  useEffect(() => {
    if (quickBuild && replan) setReplan(false)
  }, [quickBuild, replan])

  const scrollToBottom = useCallback((opts?: { behavior?: ScrollBehavior }) => {
    const root = scrollRef.current
    if (!root) return
    const viewport = root.querySelector<HTMLElement>('[data-slot="scroll-area-viewport"]')
    if (!viewport) return
    viewport.scrollTo({
      top: viewport.scrollHeight,
      behavior: opts?.behavior ?? "auto",
    })
  }, [])

  useEffect(() => {
    if (!onChatThreadChange) return
    const t = window.setTimeout(() => {
      onChatThreadChange(serializeThread(messagesRef.current))
    }, 450)
    return () => window.clearTimeout(t)
  }, [messages, onChatThreadChange])

  useEffect(() => {
    requestAnimationFrame(() => scrollToBottom())
  }, [messages, scrollToBottom])

  /** Phase D: scroll latest plan card into view once per new plan message. */
  useEffect(() => {
    const lastPlan = [...messages].reverse().find((m) => m.role === "assistant" && m.plan && !m.isGenerating)
    if (!lastPlan || lastScrolledPlanIdRef.current === lastPlan.id) return
    lastScrolledPlanIdRef.current = lastPlan.id
    requestAnimationFrame(() => {
      document.querySelector("[data-plan-review-card]")?.scrollIntoView({ behavior: "smooth", block: "nearest" })
    })
  }, [messages])

  const apiFlags = useCallback(
    () => ({
      supabaseConfigured,
      aiProvider,
      uiLang: lang,
      uiStyleKit,
      themeId,
      themeVariantId,
    }),
    [supabaseConfigured, aiProvider, uiStyleKit, themeId, themeVariantId],
  )

  const buildActivitySeed = useCallback(
    (kind: "generate" | "edit") => [
      {
        id: "codegen",
        label: kind === "edit" ? t("chat_activity_codegen_changes") : t("chat_activity_codegen"),
        status: "active" as const,
      },
      { id: "bundle", label: t("chat_activity_bundle"), status: "pending" as const },
      { id: "runtime", label: t("chat_activity_runtime"), status: "pending" as const },
    ],
    [t],
  )

  const showBillingSummary = useCallback(
    (billing?: ApiBilling) => {
      if (!billing) return
      const title = lang === "zh-HK" ? "本次扣費（USD）" : "This request charge (USD)"
      const capNote =
        billing.chargedUsd < billing.uncappedChargedUsd
          ? lang === "zh-HK"
            ? "（已套用單次上限）"
            : "(per-call cap applied)"
          : ""
      const discountNote =
        (billing.firstBuildDiscountUsd ?? 0) > 0
          ? lang === "zh-HK"
            ? `；首次建置減免 -$${billing.firstBuildDiscountUsd?.toFixed(2)}`
            : `; first-build discount -$${billing.firstBuildDiscountUsd?.toFixed(2)}`
          : ""
      const phaseLabel = billing.phase === "plan" ? "plan" : billing.phase
      const description =
        (lang === "zh-HK" ? "階段" : "Phase") +
        `: ${phaseLabel} · ` +
        (lang === "zh-HK" ? "預估" : "Estimated") +
        `: $${billing.preauthUsd.toFixed(2)} · ` +
        (lang === "zh-HK" ? "實扣" : "Charged") +
        `: $${billing.chargedUsd.toFixed(2)} ${capNote}${discountNote}`
      try {
        localStorage.setItem(
          "buildai-last-billing-summary",
          JSON.stringify({
            phase: billing.phase,
            preauthUsd: billing.preauthUsd,
            chargedUsd: billing.chargedUsd,
            ts: Date.now(),
          }),
        )
      } catch {
        /* ignore storage write issues */
      }
      toast.message(title, { description })
    },
    [lang],
  )

  const callPlan = async (
    history: Message[],
    opts?: { clarifications?: { questionId: string; answer: string }[] },
  ) => {
    if (!accessToken) {
      toast.error(lang === "zh-HK" ? "請先登入先可以用 AI 功能。" : "Please sign in to use AI features.")
      window.location.href = "/login"
      throw new Error("Unauthorized")
    }
    const apiMessages = history
      .filter((m) => !m.isGenerating && m.content)
      .map((m) => ({ role: m.role, content: m.content }))
    const res = await fetch("/api/plan", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        messages: apiMessages,
        ...(opts?.clarifications?.length ? { clarifications: opts.clarifications } : {}),
        flags: apiFlags(),
      }),
    })
    setMessages((prev) => {
      const id = pendingPlanMessageIdRef.current
      if (!id) return prev
      return prev.map((m) =>
        m.id === id ? { ...m, generatingStage: "planning_parse" } : m,
      )
    })
    const data = (await res.json()) as PlanResponse & {
      error?: string
      code?: string
      neededUsd?: number
      balanceUsd?: number
      shortageUsd?: number
      firstBuildEligible?: boolean
    }
    if (!res.ok) {
      if (res.status === 402 || data.code === "INSUFFICIENT_CREDITS") {
        const short = typeof data.shortageUsd === "number" ? data.shortageUsd : undefined
        const needed = typeof data.neededUsd === "number" ? data.neededUsd : undefined
        const balance = typeof data.balanceUsd === "number" ? data.balanceUsd : undefined
        const details =
          short != null && needed != null && balance != null
            ? lang === "zh-HK"
              ? `尚欠 $${short.toFixed(2)}（需要 $${needed.toFixed(2)}，目前 $${balance.toFixed(2)}）。`
              : `Short by $${short.toFixed(2)} (need $${needed.toFixed(2)}, balance $${balance.toFixed(2)}).`
            : data.error ?? "Planning failed"
        toast.error(details)
        setTopupOpen(true)
      }
      throw new Error(data.error ?? "Planning failed")
    }
    showBillingSummary(data.billing)
    void refreshBalance()
    return data as PlanResponse
  }

  const callGenerate = async (
    history: Message[],
    opts?: {
      approvedPlan?: PlanSnapshot
      clarifications?: { questionId: string; answer: string }[]
      refineFrom?: { appTsx: string; extraFiles?: Record<string, string> } | null
      refineKind?: "polish" | "edit"
      editOutput?: "auto" | "full" | "patch"
    },
    /** Internal: avoid infinite loop when auto-retrying patch → full output. */
    _retry?: { patchFullRetried?: boolean },
  ) => {
    if (!accessToken) {
      toast.error(lang === "zh-HK" ? "請先登入先可以用 AI 功能。" : "Please sign in to use AI features.")
      window.location.href = "/login"
      throw new Error("Unauthorized")
    }
    const apiMessages = history
      .filter((m) => !m.isGenerating && m.content)
      .map((m) => ({ role: m.role, content: m.content }))
    const res = await fetch("/api/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        messages: apiMessages,
        flags: apiFlags(),
        ...(opts?.editOutput ? { editOutput: opts.editOutput } : {}),
        ...(opts?.approvedPlan ? { approvedPlan: opts.approvedPlan } : {}),
        ...(opts?.clarifications?.length ? { clarifications: opts.clarifications } : {}),
        ...(opts?.refineFrom ? { refineFrom: opts.refineFrom } : {}),
        ...(opts?.refineFrom ? { refineKind: opts.refineKind ?? "polish" } : {}),
      }),
    })
    setMessages((prev) => {
      const last = [...prev].reverse().find((m) => m.isGenerating && m.role === "assistant")
      if (!last) return prev
      return prev.map((m) =>
        m.id === last.id ? { ...m, generatingStage: "codegen_parse" } : m,
      )
    })
    const data = (await res.json()) as GenerateResponse & {
      error?: string
      code?: string
      neededUsd?: number
      balanceUsd?: number
      shortageUsd?: number
      firstBuildEligible?: boolean
    }
    if (!res.ok) {
      const errText = data.error ?? ""
      const patchApplyFailed =
        data.code === "PATCH_APPLY_FAILED" ||
        errText.includes("Patch context mismatch") ||
        errText.includes("Patch delete mismatch")
      if (
        !_retry?.patchFullRetried &&
        opts?.editOutput === "patch" &&
        opts?.refineFrom &&
        patchApplyFailed
      ) {
        toast.message(
          lang === "zh-HK"
            ? "Patch 套用失敗，已自動改用完整重寫。"
            : "Patch apply failed, automatically retrying with full rewrite.",
        )
        return callGenerate(
          history,
          { ...opts, editOutput: "full" },
          { patchFullRetried: true },
        )
      }
      if (res.status === 402 || data.code === "INSUFFICIENT_CREDITS") {
        const short = typeof data.shortageUsd === "number" ? data.shortageUsd : undefined
        const needed = typeof data.neededUsd === "number" ? data.neededUsd : undefined
        const balance = typeof data.balanceUsd === "number" ? data.balanceUsd : undefined
        const details =
          short != null && needed != null && balance != null
            ? lang === "zh-HK"
              ? `尚欠 $${short.toFixed(2)}（需要 $${needed.toFixed(2)}，目前 $${balance.toFixed(2)}）。`
              : `Short by $${short.toFixed(2)} (need $${needed.toFixed(2)}, balance $${balance.toFixed(2)}).`
            : data.error ?? "Generation failed"
        toast.error(details)
        const kind: ResumePayload["kind"] =
          opts?.refineKind === "edit" || opts?.editOutput === "patch"
            ? "patch_edit"
            : opts?.approvedPlan
              ? "confirm_build"
              : "quick_build"
        const userGoal = [...history].reverse().find((m) => m.role === "user")?.content?.trim() || pendingGoalRef.current || "Continue"
        const payload: ResumePayload = {
          kind,
          projectKey,
          userGoal,
          history: history
            .filter((m) => m.content)
            .map((m) => ({ role: m.role, content: m.content, ts: m.timestamp.getTime() })),
          opts,
          ts: Date.now(),
        }
        safeWriteResumePayload(payload)
        setResumePayload(payload)
        setTopupOpen(true)
      }
      throw new Error(data.error ?? "Generation failed")
    }
    showBillingSummary(data.billing)
    return data as GenerateResponse
  }

  const callPreviewBundle = useCallback(async (files: Record<string, string>) => {
    const res = await fetch("/api/preview-bundle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ files }),
    })
    const data = (await res.json()) as PreviewBundleApiResponse
    if (!res.ok) throw new Error(data.error ?? `Bundle failed (HTTP ${res.status})`)
    return data
  }, [])

  const generateWithBundleGate = useCallback(
    async (
      historyForApi: Message[],
      initial: GenerateResponse,
      opts: {
        approvedPlan?: PlanSnapshot
        clarifications?: { questionId: string; answer: string }[]
        userGoalForRepair: string
        maxRepairAttempts?: number
        assistantMessageId?: string
      },
    ): Promise<GenerateResponse> => {
      const maxRepairAttempts = opts.maxRepairAttempts ?? 2

      const runBundle = async (data: GenerateResponse): Promise<GenerateResponse> => {
        if (opts.assistantMessageId) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === opts.assistantMessageId
                ? {
                    ...m,
                    generatingStage: "codegen_parse",
                    activity: (m.activity ?? []).map((a) =>
                      a.id === "bundle" ? { ...a, status: "active" } : a,
                    ),
                  }
                : m,
            ),
          )
        }
        const files = normalizePreviewFiles(data.appTsx, data.extraFiles)
        const r = await callPreviewBundle(files)
        if (opts.assistantMessageId) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === opts.assistantMessageId
                ? {
                    ...m,
                    activity: (m.activity ?? []).map((a) =>
                      a.id === "bundle" ? { ...a, status: "done" } : a,
                    ),
                  }
                : m,
            ),
          )
        }
        if (r.patchedFiles && Object.keys(r.patchedFiles).length > 0) {
          const next: GenerateResponse = { ...data }
          if (r.patchedFiles["/App.tsx"]) next.appTsx = r.patchedFiles["/App.tsx"]
          const patchedExtras: Record<string, string> = { ...(next.extraFiles ?? {}) }
          for (const [k, v] of Object.entries(r.patchedFiles)) {
            if (k === "/App.tsx") continue
            patchedExtras[k] = v
          }
          next.extraFiles = patchedExtras
          return next
        }
        return data
      }

      let cur = initial

      for (let attempt = 0; attempt <= maxRepairAttempts; attempt++) {
        try {
          return await runBundle(cur)
        } catch (e) {
          const err = e instanceof Error ? e.message : String(e)
          if (attempt >= maxRepairAttempts) {
            if (opts.assistantMessageId) {
              const head = err.split("\n").find(Boolean)?.slice(0, 200) ?? err.slice(0, 200)
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === opts.assistantMessageId
                    ? {
                        ...m,
                        activity: (m.activity ?? []).map((a) =>
                          a.id === "bundle" ? { ...a, status: "error", detail: head } : a,
                        ),
                      }
                    : m,
                ),
              )
            }
            throw new Error(`Auto-check failed: your code didn't bundle.\n\n${err}`)
          }

          toast.message("Auto-fixing build errors…", {
            description: "We’re repairing the generated code before updating the preview.",
          })

          if (opts.assistantMessageId) {
            const head = err.split("\n").find(Boolean)?.slice(0, 200) ?? err.slice(0, 200)
            setMessages((prev) =>
              prev.map((m) =>
                m.id === opts.assistantMessageId
                  ? {
                      ...m,
                      activity: [
                        ...(m.activity ?? []),
                        {
                          id: `repair-${attempt + 1}`,
                          label: `${t("chat_activity_repair_attempt")} ${attempt + 1}/${maxRepairAttempts + 1}`,
                          status: "active",
                          detail: head,
                        },
                      ],
                    }
                  : m,
              ),
            )
          }

          const repairInstruction: Message = {
            id: `bundle-repair-${Date.now()}-${attempt}`,
            role: "user",
            content:
              `The generated code failed to bundle in the preview build step.\n\n` +
              `Goal (keep behavior + design intent):\n${opts.userGoalForRepair}\n\n` +
              `Bundle error:\n${err}\n\n` +
              `Fix the errors so it bundles successfully. Keep changes minimal and safe.`,
            timestamp: new Date(),
          }

          cur = await callGenerate([...historyForApi, repairInstruction], {
            approvedPlan: opts.approvedPlan,
            clarifications: opts.clarifications,
            refineFrom: { appTsx: cur.appTsx, extraFiles: cur.extraFiles },
            refineKind: "edit",
            editOutput: "patch",
          })
          if (opts.assistantMessageId) {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === opts.assistantMessageId
                  ? {
                      ...m,
                      activity: (m.activity ?? []).map((a) =>
                        a.id === `repair-${attempt + 1}` ? { ...a, status: "done" } : a,
                      ),
                    }
                  : m,
              ),
            )
          }
          // If patch application failed server-side (context mismatch), fall back to a full rewrite.
          // This reduces cases where users are charged but preview cannot be updated.
          if (!cur?.appTsx?.trim()) {
            cur = await callGenerate([...historyForApi, repairInstruction], {
              approvedPlan: opts.approvedPlan,
              clarifications: opts.clarifications,
              refineFrom: { appTsx: cur.appTsx, extraFiles: cur.extraFiles },
              refineKind: "edit",
              editOutput: "full",
            })
          }
        }
      }

      return cur
    },
    [callGenerate, callPreviewBundle, t],
  )

  const handleSubmit = async () => {
    if (!input.trim() || isLoading) return

    const userText = input.trim()
    // A new request supersedes any stale resume prompt from older failed builds.
    safeClearResumePayload()
    setResumePayload(null)
    pendingGoalRef.current = userText
    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: userText,
      timestamp: new Date(),
    }

    setMessages((prev) => [...prev, userMessage])
    setInput("")
    setIsLoading(true)

    const baseApprovedPlan = currentApprovedPlan
    const baseClarifications = currentClarifications

    if (Boolean(canRefineExisting) && !replan && !quickBuild && refineFrom?.appTsx?.trim()) {
      const assistantId = (Date.now() + 1).toString()
      setMessages((prev) => [
        ...prev,
        {
          id: assistantId,
          role: "assistant",
          content: "",
          timestamp: new Date(),
          isGenerating: true,
          generatingLabel: "building",
          generatingStage: "codegen_request",
          activity: buildActivitySeed("edit"),
        },
      ])
      try {
        const first = await callGenerate([...messages, userMessage], {
          approvedPlan: baseApprovedPlan,
          clarifications: baseClarifications,
          refineFrom,
          refineKind: "edit",
          editOutput: "patch",
        })
        const data = await generateWithBundleGate([...messages, userMessage], first, {
          approvedPlan: baseApprovedPlan,
          clarifications: baseClarifications,
          userGoalForRepair: userText,
          assistantMessageId: assistantId,
        })
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  activity: (m.activity ?? []).map((a) =>
                    a.id === "codegen"
                      ? { ...a, status: "done" }
                      : a.id === "bundle"
                        ? { ...a, status: "done" }
                        : a.id === "runtime"
                          ? { ...a, status: "done" }
                        : a,
                  ),
                }
              : m,
          ),
        )
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantId
              ? {
                  ...msg,
                  content: data.reply,
                  generatingStage: "done",
                  generatingLabel: msg.generatingLabel,
                  isGenerating: true,
                  generatedComponent: true,
                  ...(data.changedFiles?.length ? { changedFiles: data.changedFiles } : {}),
                }
              : msg,
          ),
        )
        window.setTimeout(() => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, isGenerating: false, generatingStage: undefined, generatingLabel: undefined }
                : m,
            ),
          )
        }, 550)
        const safeAppTsx = data.appTsx?.trim() ? data.appTsx : FALLBACK_PREVIEW_APP_TSX
        onGenerateSuccess({
          reply: data.reply,
          userPrompt: userText,
          appTsx: safeAppTsx,
          extraFiles: data.extraFiles,
          ...(data.changedFiles?.length ? { changedFiles: data.changedFiles } : {}),
          ...(baseApprovedPlan ? { approvedPlan: baseApprovedPlan } : {}),
          ...(baseClarifications?.length ? { planClarifications: baseClarifications } : {}),
        })
        void refreshBalance()
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Something went wrong"
        toast.error(msg)
        const fallback = buildFallbackErrorAppTsx({
          title: "Preview update failed",
          detail: `We received a response, but could not safely apply it.\n\n${msg}\n\nTry: click Refresh, or describe what you want fixed.`,
        })
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: msg, isGenerating: false, generatingStage: undefined, generatingLabel: undefined, generatedComponent: true }
              : m,
          ),
        )
        onGenerateSuccess({ reply: msg, userPrompt: userText, appTsx: fallback })
      } finally {
        setIsLoading(false)
      }
      return
    }

    if (quickBuild) {
      const assistantId = (Date.now() + 1).toString()
      setMessages((prev) => [
        ...prev,
        {
          id: assistantId,
          role: "assistant",
          content: "",
          timestamp: new Date(),
          isGenerating: true,
          generatingLabel: "building",
          generatingStage: "codegen_request",
          activity: buildActivitySeed("generate"),
        },
      ])
      const historyForApi = [...messages, userMessage]
      try {
        const first = await callGenerate(historyForApi)
        const data = await generateWithBundleGate(historyForApi, first, {
          userGoalForRepair: userText,
          assistantMessageId: assistantId,
        })
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  activity: (m.activity ?? []).map((a) =>
                    a.id === "codegen"
                      ? { ...a, status: "done" }
                      : a.id === "bundle"
                        ? { ...a, status: "done" }
                        : a.id === "runtime"
                          ? { ...a, status: "done" }
                        : a,
                  ),
                }
              : m,
          ),
        )
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantId
              ? {
                  ...msg,
                  content: data.reply,
                  generatingStage: "done",
                  generatingLabel: msg.generatingLabel,
                  isGenerating: true,
                  generatedComponent: true,
                  ...(data.changedFiles?.length ? { changedFiles: data.changedFiles } : {}),
                }
              : msg,
          ),
        )
        window.setTimeout(() => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, isGenerating: false, generatingStage: undefined, generatingLabel: undefined }
                : m,
            ),
          )
        }, 550)
        const safeAppTsx = data.appTsx?.trim() ? data.appTsx : FALLBACK_PREVIEW_APP_TSX
        onGenerateSuccess({
          reply: data.reply,
          userPrompt: userText,
          appTsx: safeAppTsx,
          extraFiles: data.extraFiles,
          ...(data.changedFiles?.length ? { changedFiles: data.changedFiles } : {}),
          planClarifications: undefined,
        })
        void refreshBalance()
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Something went wrong"
        toast.error(msg)
        const fallback = buildFallbackErrorAppTsx({
          title: "Preview update failed",
          detail: `We received a response, but could not safely apply it.\n\n${msg}\n\nTry: click Refresh, or describe what you want fixed.`,
        })
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: msg, isGenerating: false, generatingStage: undefined, generatingLabel: undefined, generatedComponent: true }
              : m,
          ),
        )
        onGenerateSuccess({ reply: msg, userPrompt: userText, appTsx: fallback })
      } finally {
        setIsLoading(false)
      }
      return
    }

    const planAssistantId = (Date.now() + 1).toString()
    pendingPlanMessageIdRef.current = planAssistantId
    setMessages((prev) => [
      ...prev,
      {
        id: planAssistantId,
        role: "assistant",
        content: "",
        timestamp: new Date(),
        isGenerating: true,
        generatingLabel: "planning",
        generatingStage: "planning_request",
      },
    ])

    const historyForPlan = [...messages, userMessage]
    try {
      const planData = await callPlan(historyForPlan)
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === planAssistantId
            ? {
                ...msg,
                content: planData.reply,
                plan: planData.plan,
                planStage: planData.plan.openQuestions?.length ? "questions" : "review",
                isGenerating: false,
                generatingLabel: undefined,
              }
            : msg,
        ),
      )
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Something went wrong"
      toast.error(msg)
      setMessages((prev) => prev.filter((m) => m.id !== planAssistantId))
    } finally {
      setIsLoading(false)
    }
  }

  const handleConfirmBuild = async (
    planMessageId: string,
    plan: PlanSnapshot,
    clarifications: { questionId: string; answer: string }[],
  ) => {
    if (isLoading) return
    const cur = messagesRef.current
    const planIdx = cur.findIndex((m) => m.id === planMessageId)
    if (planIdx < 0) return

    const slice = cur.slice(0, planIdx + 1).filter((m) => !m.isGenerating && m.content.trim())
    const userGoal =
      slice.filter((m) => m.role === "user").map((m) => m.content).join("\n\n") || pendingGoalRef.current

    setIsLoading(true)
    const assistantId = (Date.now() + 2).toString()
    setMessages((prev) => [
      ...prev,
      {
        id: assistantId,
        role: "assistant",
        content: "",
        timestamp: new Date(),
        isGenerating: true,
        generatingLabel: "building",
        generatingStage: "codegen_request",
        activity: buildActivitySeed("generate"),
      },
    ])

    try {
      const first = await callGenerate(slice, {
        approvedPlan: plan,
        clarifications,
      })
      const data = await generateWithBundleGate(slice, first, {
        approvedPlan: plan,
        clarifications,
        userGoalForRepair: userGoal,
        assistantMessageId: assistantId,
      })
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantId
            ? {
                ...msg,
                activity: (msg.activity ?? []).map((a) =>
                  a.id === "codegen"
                    ? { ...a, status: "done" }
                    : a.id === "bundle"
                      ? { ...a, status: "done" }
                      : a.id === "runtime"
                        ? { ...a, status: "done" }
                        : a,
                ),
                content: data.reply,
                generatingStage: "done",
                generatingLabel: msg.generatingLabel,
                isGenerating: true,
                generatedComponent: true,
                ...(data.changedFiles?.length ? { changedFiles: data.changedFiles } : {}),
              }
            : msg,
        ),
      )
      window.setTimeout(() => {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, isGenerating: false, generatingStage: undefined, generatingLabel: undefined }
              : m,
          ),
        )
      }, 550)
      const safeAppTsx = data.appTsx?.trim() ? data.appTsx : FALLBACK_PREVIEW_APP_TSX
      onGenerateSuccess({
        reply: data.reply,
        userPrompt: userGoal,
        appTsx: safeAppTsx,
        extraFiles: data.extraFiles,
        ...(data.changedFiles?.length ? { changedFiles: data.changedFiles } : {}),
        approvedPlan: plan,
        planClarifications: clarifications.length ? clarifications : undefined,
      })
      void refreshBalance()
      pendingPlanMessageIdRef.current = null
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Something went wrong"
      toast.error(msg)
      const fallback = buildFallbackErrorAppTsx({
        title: "Preview update failed",
        detail: `We received a response, but could not safely apply it.\n\n${msg}\n\nTry: click Refresh, or describe what you want fixed.`,
      })
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, content: msg, isGenerating: false, generatingStage: undefined, generatingLabel: undefined, generatedComponent: true }
            : m,
        ),
      )
      onGenerateSuccess({ reply: msg, userPrompt: userGoal, appTsx: fallback })
    } finally {
      setIsLoading(false)
    }
  }

  const handleConfirmPlanQuestions = async (
    planMessageId: string,
    clarifications: { questionId: string; answer: string }[],
  ) => {
    if (isLoading) return
    const cur = messagesRef.current
    const planIdx = cur.findIndex((m) => m.id === planMessageId)
    if (planIdx < 0) return

    const historyForPlan = cur
      .slice(0, planIdx)
      .filter((m) => !m.isGenerating && m.content.trim())

    setIsLoading(true)
    pendingPlanMessageIdRef.current = planMessageId
    setMessages((prev) =>
      prev.map((m) =>
        m.id === planMessageId
          ? { ...m, isGenerating: true, generatingLabel: "planning", generatingStage: "planning_request" }
          : m,
      ),
    )
    try {
      const planData = await callPlan(historyForPlan, { clarifications })
      const reviewId = `${planMessageId}-review-${Date.now()}`
      setMessages((prev) => {
        const base = prev.map((m) =>
          m.id === planMessageId
            ? {
                ...m,
                isGenerating: false,
                generatingLabel: undefined,
                generatingStage: undefined,
                planStage: "questions" as const,
              }
            : m,
        )
        const at = base.findIndex((m) => m.id === planMessageId)
        const reviewMsg: Message = {
          id: reviewId,
          role: "assistant",
          content: planData.reply,
          timestamp: new Date(),
          plan: planData.plan,
          planStage: "review",
        }
        if (at < 0) return [...base, reviewMsg]
        return [...base.slice(0, at + 1), reviewMsg, ...base.slice(at + 1)]
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Something went wrong"
      toast.error(msg)
      setMessages((prev) =>
        prev.map((m) =>
          m.id === planMessageId
            ? { ...m, isGenerating: false, generatingLabel: undefined, generatingStage: undefined }
            : m,
        ),
      )
    } finally {
      pendingPlanMessageIdRef.current = null
      setIsLoading(false)
    }
  }

  const handleRevisePlan = () => {
    textareaRef.current?.focus()
    setInput((prev) => (prev.trim() ? prev : prev + "Update the plan: "))
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      void handleSubmit()
    }
  }

  const handleCopy = (content: string, id: string) => {
    void navigator.clipboard.writeText(content)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const handleSuggestionClick = (suggestion: string) => {
    setInput(suggestion)
    textareaRef.current?.focus()
  }

  const handleResumeLast = useCallback(async () => {
    if (isLoading) return
    const p = safeReadResumePayload(projectKey)
    if (!p) {
      setResumePayload(null)
      return
    }
    if (!p.history?.length) {
      safeClearResumePayload()
      setResumePayload(null)
      return
    }
    const history: Message[] = p.history.map((m) => ({
      id: `resume-${m.ts}-${Math.random().toString(16).slice(2)}`,
      role: m.role,
      content: m.content,
      timestamp: new Date(m.ts),
    }))
    const assistantId = (Date.now() + 1).toString()
    setIsLoading(true)
    setMessages((prev) => [
      ...prev,
      {
        id: assistantId,
        role: "assistant",
        content: "",
        timestamp: new Date(),
        isGenerating: true,
        generatingLabel: "building",
        generatingStage: "codegen_request",
        activity: buildActivitySeed("generate"),
      },
    ])
    try {
      const first = await callGenerate(history, p.opts)
      const data = await generateWithBundleGate(history, first, {
        approvedPlan: p.opts?.approvedPlan,
        clarifications: p.opts?.clarifications,
        userGoalForRepair: p.userGoal,
        assistantMessageId: assistantId,
      })
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantId
            ? {
                ...msg,
                activity: (msg.activity ?? []).map((a) =>
                  a.id === "codegen"
                    ? { ...a, status: "done" }
                    : a.id === "bundle"
                      ? { ...a, status: "done" }
                      : a.id === "runtime"
                        ? { ...a, status: "done" }
                        : a,
                ),
                content: data.reply,
                isGenerating: false,
                generatingLabel: undefined,
                generatedComponent: true,
                ...(data.changedFiles?.length ? { changedFiles: data.changedFiles } : {}),
              }
            : msg,
        ),
      )
      const safeAppTsx = data.appTsx?.trim() ? data.appTsx : FALLBACK_PREVIEW_APP_TSX
      onGenerateSuccess({
        reply: data.reply,
        userPrompt: p.userGoal,
        appTsx: safeAppTsx,
        extraFiles: data.extraFiles,
        ...(data.changedFiles?.length ? { changedFiles: data.changedFiles } : {}),
        ...(p.opts?.approvedPlan ? { approvedPlan: p.opts.approvedPlan } : {}),
        ...(p.opts?.clarifications?.length ? { planClarifications: p.opts.clarifications } : {}),
      })
      safeClearResumePayload()
      setResumePayload(null)
      void refreshBalance()
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Something went wrong"
      toast.error(msg)
      setMessages((prev) => prev.filter((m) => m.id !== assistantId))
    } finally {
      setIsLoading(false)
    }
  }, [buildActivitySeed, callGenerate, generateWithBundleGate, isLoading, onGenerateSuccess, projectKey, refreshBalance])

  return (
    <div className="flex flex-col h-full min-h-0">
      <TopUpDialog open={topupOpen} onOpenChange={setTopupOpen} />
      <ScrollArea ref={scrollRef} className="flex-1 min-h-0 p-4">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center px-4 min-h-[240px]">
            <div className="size-16 rounded-2xl bg-accent/20 flex items-center justify-center mb-6">
              <Sparkles className="size-8 text-accent" />
            </div>
            <h2 className="text-2xl font-semibold mb-2 text-balance">{t("chat_empty_title")}</h2>
            <p className="text-muted-foreground mb-4 max-w-md text-balance">
              {t("chat_empty_desc")}
            </p>
            <div className="flex flex-col sm:flex-row sm:flex-wrap items-start sm:items-center gap-3 mb-8 text-sm text-muted-foreground w-full max-w-2xl">
              <div className="flex items-center gap-2">
                <Switch id="quick-build" checked={quickBuild} onCheckedChange={setQuickBuild} />
                <Label htmlFor="quick-build" className="cursor-pointer">
                  {t("chat_quick_build")}
                </Label>
              </div>
              <Button type="button" size="sm" variant="outline" className="h-8" onClick={() => setAppearanceOpen(true)}>
                {t("chat_appearance")}
              </Button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-2xl">
              {(lang === "zh-HK" ? SUGGESTIONS_ZH_HK : SUGGESTIONS).map((suggestion, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => handleSuggestionClick(suggestion)}
                  className="text-left p-3 rounded-lg border border-border bg-card hover:bg-secondary/50 transition-colors text-xs leading-snug line-clamp-6"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {messages.map((message) => {
              const planIdx = messages.findIndex((m) => m.id === message.id)
              const planSuperseded =
                message.plan != null &&
                messages
                  .slice(planIdx + 1)
                  .some((m) => m.role === "assistant" && (Boolean(m.generatedComponent) || Boolean(m.plan)))

              return (
              <div
                key={message.id}
                className={cn(
                  "flex gap-3",
                  message.role === "user" ? "justify-end" : "justify-start",
                )}
              >
                {message.role === "assistant" && (
                  <div className="size-8 rounded-lg bg-accent flex items-center justify-center shrink-0">
                    <Bot className="size-4 text-accent-foreground" />
                  </div>
                )}
                <div
                  className={cn(
                    "rounded-xl px-4 py-3 max-w-[85%]",
                    message.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-card border border-border",
                  )}
                >
                  {message.isGenerating ? (
                    <GeneratingStatus
                      label={message.generatingLabel}
                      stage={message.generatingStage}
                      activity={message.activity}
                    />
                  ) : (
                    <>
                      <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                      {message.plan ? (
                        message.planStage === "questions" && message.plan.openQuestions.length > 0 ? (
                          <PlanQuestionsCard
                            questions={message.plan.openQuestions}
                            disabled={isLoading || planSuperseded}
                            prevLabel={lang === "zh-HK" ? "上一題" : "Previous"}
                            nextLabel={lang === "zh-HK" ? "下一題" : "Next"}
                            continueLabel={lang === "zh-HK" ? "繼續" : "Continue"}
                            onConfirm={({ clarifications }) =>
                              void handleConfirmPlanQuestions(message.id, clarifications)
                            }
                          />
                        ) : (
                          <PlanReviewCard
                            plan={message.plan}
                            disabled={isLoading || planSuperseded}
                            onRevisePlan={handleRevisePlan}
                            onConfirmBuild={({ clarifications }) =>
                              void handleConfirmBuild(message.id, message.plan!, clarifications)
                            }
                          />
                        )
                      ) : null}
                      {message.generatedComponent ? (
                        <div className="mt-3 pt-3 border-t border-border">
                          <div className="flex items-center justify-between gap-2">
                            <Badge variant="secondary" className="gap-1">
                              <Code2 className="size-3" />
                              Preview updated
                            </Badge>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2"
                              onClick={() => handleCopy(message.content, message.id)}
                            >
                              {copiedId === message.id ? (
                                <Check className="size-3" />
                              ) : (
                                <Copy className="size-3" />
                              )}
                            </Button>
                          </div>
                          {message.changedFiles?.length ? (
                            <p className="mt-2 text-xs text-muted-foreground">
                              Changed:{" "}
                              <span className="text-foreground">
                                {message.changedFiles
                                  .map((p) => p.replace(/^\//, ""))
                                  .slice(0, 4)
                                  .join(", ")}
                                {message.changedFiles.length > 4 ? "…" : ""}
                              </span>
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                    </>
                  )}
                </div>
                {message.role === "user" && (
                  <div className="size-8 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                    <User className="size-4" />
                  </div>
                )}
              </div>
            )})}
          </div>
        )}
      </ScrollArea>

      <div className="p-4 border-t border-border shrink-0 space-y-3">
        {resumePayload ? (
          <div className="rounded-xl border border-border bg-card/40 p-3 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-medium">{t("chat_resume_last")}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{t("chat_resume_last_desc")}</div>
            </div>
            <Button type="button" size="sm" className="shrink-0" onClick={() => void handleResumeLast()} disabled={isLoading}>
              {t("chat_resume_last")}
            </Button>
          </div>
        ) : null}
        <div className="flex items-center gap-2 flex-wrap px-0.5">
          <Switch id="quick-build-footer" checked={quickBuild} onCheckedChange={setQuickBuild} />
          <Label htmlFor="quick-build-footer" className="text-xs text-muted-foreground cursor-pointer">
            {t("chat_quick_build")}
          </Label>
          {Boolean(canRefineExisting) && !quickBuild ? (
            <div className="flex items-center gap-2">
              <Switch id="replan-footer" checked={replan} onCheckedChange={setReplan} />
              <Label htmlFor="replan-footer" className="text-xs text-muted-foreground cursor-pointer">
                {t("chat_replan")}
              </Label>
            </div>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 ml-auto"
            onClick={() => setAppearanceOpen(true)}
          >
            {t("chat_appearance")}
          </Button>
        </div>

        <Dialog open={appearanceOpen} onOpenChange={setAppearanceOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{t("chat_appearance_title")}</DialogTitle>
              <DialogDescription>{t("chat_appearance_desc")}</DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <div className="space-y-2">
                <Label className="text-sm">{t("chat_ui_pattern")}</Label>
                <Select value={uiStyleKit} onValueChange={(v) => setUiStyleKit(v as UiStyleKitId)}>
                  <SelectTrigger size="sm" className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="default">{t("ui_flexible")}</SelectItem>
                    <SelectItem value="admin_shell">{t("ui_admin_shell")}</SelectItem>
                    <SelectItem value="dashboard_analytics">{t("ui_dashboard_analytics")}</SelectItem>
                    <SelectItem value="saas_marketing">{t("ui_saas_marketing")}</SelectItem>
                    <SelectItem value="storefront_admin">{t("ui_storefront_admin")}</SelectItem>
                    <SelectItem value="storefront">{t("ui_storefront")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-sm">{t("chat_theme")}</Label>
                <Select value={themeId} onValueChange={(v) => setThemeId(v as ThemeId)}>
                  <SelectTrigger size="sm" className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">{t("theme_auto")}</SelectItem>
                    <SelectItem value="neon_dark">{t("theme_neon_dark")}</SelectItem>
                    <SelectItem value="natural_light">{t("theme_natural_light")}</SelectItem>
                    <SelectItem value="studio_dark">{t("theme_studio_dark")}</SelectItem>
                    <SelectItem value="minimal_light">{t("theme_minimal_light")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label className="text-sm">{t("chat_variant")}</Label>
                <Select value={themeVariantId} onValueChange={(v) => setThemeVariantId(v)}>
                  <SelectTrigger size="sm" className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">{t("variant_auto")}</SelectItem>
                    <SelectItem value="neon_glow">{t("variant_neon_glow")}</SelectItem>
                    <SelectItem value="neon_holo">{t("variant_neon_holo")}</SelectItem>
                    <SelectItem value="natural_paper">{t("variant_natural_paper")}</SelectItem>
                    <SelectItem value="natural_botanical">{t("variant_natural_botanical")}</SelectItem>
                    <SelectItem value="studio_spotlight">{t("variant_studio_spotlight")}</SelectItem>
                    <SelectItem value="minimal_plain">{t("variant_minimal_plain")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </DialogContent>
        </Dialog>
        <div className="relative bg-card rounded-xl border border-border focus-within:border-accent/50 focus-within:ring-1 focus-within:ring-accent/20 transition-all">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              quickBuild
                ? t("chat_placeholder_quick")
                : Boolean(canRefineExisting) && !replan
                  ? t("chat_placeholder_patch")
                  : t("chat_placeholder_plan")
            }
            className="min-h-[80px] max-h-[200px] resize-none border-0 bg-transparent focus-visible:ring-0 pr-12 text-sm"
          />
          <div className="flex items-center justify-between px-3 pb-3">
            <div className="flex items-center gap-1">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-muted-foreground" disabled>
                      <Paperclip className="size-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t("chat_tooltip_coming_soon")}</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-muted-foreground" disabled>
                      <ImageIcon className="size-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t("chat_tooltip_coming_soon")}</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2 text-muted-foreground"
                      onClick={onOpenIntegrations}
                    >
                      <Database className="size-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t("chat_tooltip_integrations")}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <Button
              type="button"
              size="sm"
              onClick={() => void handleSubmit()}
              disabled={!input.trim() || isLoading}
              className="gap-2"
            >
              {isLoading ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              {quickBuild ? t("chat_generate") : hasGenerated && !replan ? t("chat_apply") : t("chat_continue")}
            </Button>
          </div>
        </div>
        {/* Footer note removed (per UX request). */}
      </div>
    </div>
  )
}
