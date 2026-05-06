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
  generatedComponent?: boolean
  changedFiles?: string[]
  /** When set, this assistant turn is a plan awaiting user confirmation. */
  plan?: PlanSnapshot
}

type PreviewBundleApiResponse = {
  js?: string
  css?: string
  error?: string
  patchedFiles?: Record<string, string>
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

function GeneratingStatus({
  label,
  stage,
}: {
  label?: "planning" | "building"
  stage?: Message["generatingStage"]
}) {
  const { t } = useI18n()
  const percentByStage: Partial<Record<NonNullable<Message["generatingStage"]>, number>> = {
    planning_request: 10,
    planning_parse: 35,
    waiting_confirm: 50,
    codegen_request: 70,
    codegen_parse: 90,
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

  const cur = stage ? lines[stage] : fallback
  const pct = stage ? percentByStage[stage] : undefined
  const title = pct != null ? `${cur.title} (${pct}%)` : cur.title

  return (
    <div className="space-y-1 text-sm">
      <p className="flex items-center gap-2">
        <Loader2 className="size-4 animate-spin shrink-0" />
        {title}
      </p>
      {cur.detail ? <p className="text-xs text-muted-foreground pl-6">{cur.detail}</p> : null}
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
    }))
}

export function ChatPanel({
  projectKey: _projectKey,
  initialChatThread,
  onChatThreadChange,
  supabaseConfigured,
  onOpenIntegrations,
  onGenerateSuccess,
  hasGenerated,
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
      uiStyleKit,
      themeId,
      themeVariantId,
    }),
    [supabaseConfigured, aiProvider, uiStyleKit, themeId, themeVariantId],
  )

  const callPlan = async (history: Message[]) => {
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
      body: JSON.stringify({ messages: apiMessages, flags: apiFlags() }),
    })
    setMessages((prev) => {
      const id = pendingPlanMessageIdRef.current
      if (!id) return prev
      return prev.map((m) =>
        m.id === id ? { ...m, generatingStage: "planning_parse" } : m,
      )
    })
    const data = (await res.json()) as PlanResponse & { error?: string; code?: string }
    if (!res.ok) {
      if (res.status === 402 || data.code === "INSUFFICIENT_CREDITS") setTopupOpen(true)
      throw new Error(data.error ?? "Planning failed")
    }
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
    const data = (await res.json()) as GenerateResponse & { error?: string; code?: string }
    if (!res.ok) {
      if (res.status === 402 || data.code === "INSUFFICIENT_CREDITS") setTopupOpen(true)
      throw new Error(data.error ?? "Generation failed")
    }
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
      },
    ): Promise<GenerateResponse> => {
      const maxRepairAttempts = opts.maxRepairAttempts ?? 2

      const runBundle = async (data: GenerateResponse): Promise<GenerateResponse> => {
        const files = normalizePreviewFiles(data.appTsx, data.extraFiles)
        const r = await callPreviewBundle(files)
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
            throw new Error(`Auto-check failed: your code didn't bundle.\n\n${err}`)
          }

          toast.message("Auto-fixing build errors…", {
            description: "We’re repairing the generated code before updating the preview.",
          })

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
        }
      }

      return cur
    },
    [callGenerate, callPreviewBundle],
  )

  const handleSubmit = async () => {
    if (!input.trim() || isLoading) return

    const userText = input.trim()
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

    if (hasGenerated && !replan && !quickBuild && refineFrom?.appTsx?.trim()) {
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
        })
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantId
              ? {
                  ...msg,
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
        setMessages((prev) => prev.filter((m) => m.id !== assistantId))
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
        },
      ])
      const historyForApi = [...messages, userMessage]
      try {
        const first = await callGenerate(historyForApi)
        const data = await generateWithBundleGate(historyForApi, first, {
          userGoalForRepair: userText,
        })
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantId
              ? {
                  ...msg,
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
        setMessages((prev) => prev.filter((m) => m.id !== assistantId))
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
      })
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantId
            ? {
                ...msg,
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
      setMessages((prev) => prev.filter((m) => m.id !== assistantId))
    } finally {
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
                    <GeneratingStatus label={message.generatingLabel} stage={message.generatingStage} />
                  ) : (
                    <>
                      <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                      {message.plan ? (
                        <PlanReviewCard
                          plan={message.plan}
                          disabled={isLoading || planSuperseded}
                          onRevisePlan={handleRevisePlan}
                          onConfirmBuild={({ clarifications }) =>
                            void handleConfirmBuild(message.id, message.plan!, clarifications)
                          }
                        />
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
        <div className="flex items-center gap-2 flex-wrap px-0.5">
          <Switch id="quick-build-footer" checked={quickBuild} onCheckedChange={setQuickBuild} />
          <Label htmlFor="quick-build-footer" className="text-xs text-muted-foreground cursor-pointer">
            {t("chat_quick_build")}
          </Label>
          {hasGenerated && !quickBuild ? (
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
                : hasGenerated && !replan
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
        <p className="text-xs text-muted-foreground text-center">
          {t("chat_footer_note")}
        </p>
      </div>
    </div>
  )
}
