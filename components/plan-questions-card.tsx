"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import type { PlanQuestion } from "@/lib/plan-schema"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { useI18n } from "@/components/i18n-context"

export interface PlanQuestionsCardProps {
  questions: PlanQuestion[]
  disabled?: boolean
  prevLabel: string
  nextLabel: string
  continueLabel: string
  onConfirm: (args: { clarifications: { questionId: string; answer: string }[] }) => void
}

type ResolvedChoice = { key: string; letter: string; label: string }

function resolveChoices(q: PlanQuestion): ResolvedChoice[] {
  if (q.options?.length) {
    return q.options.map((o, i) => ({
      key: o.id,
      letter: String.fromCharCode(65 + i),
      label: o.label,
    }))
  }
  return q.suggestedAnswers.map((label, i) => ({
    key: `_${i}`,
    letter: String.fromCharCode(65 + i),
    label,
  }))
}

function selectionModeOf(q: PlanQuestion): "single" | "multi" {
  return q.selectionMode === "multi" ? "multi" : "single"
}

function allowCustomOf(q: PlanQuestion): boolean {
  return q.allowCustomAnswer !== false
}

export function PlanQuestionsCard({
  questions,
  disabled,
  prevLabel,
  nextLabel,
  continueLabel,
  onConfirm,
}: PlanQuestionsCardProps) {
  const { t } = useI18n()
  const [selectedLabels, setSelectedLabels] = useState<Record<string, string[]>>({})
  const [customByQuestion, setCustomByQuestion] = useState<Record<string, string>>({})
  const [activeIdx, setActiveIdx] = useState(0)
  const [touchedByQuestion, setTouchedByQuestion] = useState<Record<string, boolean>>({})
  const questionRefs = useRef<Record<string, HTMLDivElement | null>>({})

  useEffect(() => {
    setActiveIdx(0)
    setTouchedByQuestion({})
    setSelectedLabels({})
    setCustomByQuestion({})
  }, [questions])

  const isAnswered = (q: PlanQuestion): boolean => {
    const picked = selectedLabels[q.id] ?? []
    const custom = (customByQuestion[q.id] ?? "").trim()
    return picked.length > 0 || custom.length > 0
  }

  const clarifications = useMemo(() => {
    return questions
      .map((q) => {
        const choices = resolveChoices(q)
        const picked = selectedLabels[q.id] ?? []
        const custom = (customByQuestion[q.id] ?? "").trim()
        const parts = picked.map((label) => {
          const row = choices.find((c) => c.label === label)
          return row ? `${row.letter}) ${row.label}` : label
        })
        let answer = ""
        if (selectionModeOf(q) === "multi") {
          answer = parts.join("; ")
        } else {
          answer = parts[0] ?? ""
        }
        if (custom) {
          const other = t("plan_other_label").split("（")[0].split("(")[0].trim() || "Other"
          answer = answer ? `${answer} | ${other}: ${custom}` : `${other}: ${custom}`
        }
        return answer ? { questionId: q.id, answer } : null
      })
      .filter((x): x is { questionId: string; answer: string } => x !== null)
  }, [questions, selectedLabels, customByQuestion, t])

  const allAnswered = useMemo(() => {
    if (questions.length === 0) return true
    return questions.every((q) => isAnswered(q))
  }, [questions, selectedLabels, customByQuestion])

  const toggleChoice = (q: PlanQuestion, label: string) => {
    const mode = selectionModeOf(q)
    setSelectedLabels((prev) => {
      const cur = [...(prev[q.id] ?? [])]
      if (mode === "single") {
        const next = cur[0] === label ? [] : [label]
        return { ...prev, [q.id]: next }
      }
      const ix = cur.indexOf(label)
      if (ix >= 0) cur.splice(ix, 1)
      else cur.push(label)
      return { ...prev, [q.id]: cur }
    })
    setTouchedByQuestion((prev) => ({ ...prev, [q.id]: true }))

    // Auto-advance ONLY for single-choice.
    if (mode !== "single") return
    requestAnimationFrame(() => {
      if (!isAnswered(q)) return
      const nextIdx = Math.min(activeIdx + 1, questions.length - 1)
      if (nextIdx === activeIdx) return
      setActiveIdx(nextIdx)
      const nextQ = questions[nextIdx]
      questionRefs.current[nextQ.id]?.scrollIntoView({ behavior: "smooth", block: "start" })
    })
  }

  const handleNext = () => {
    const q = questions[activeIdx]
    if (!q) return
    setTouchedByQuestion((prev) => ({ ...prev, [q.id]: true }))
    if (!isAnswered(q)) return
    const nextIdx = Math.min(activeIdx + 1, questions.length - 1)
    if (nextIdx === activeIdx) return
    setActiveIdx(nextIdx)
    const nextQ = questions[nextIdx]
    requestAnimationFrame(() => {
      questionRefs.current[nextQ.id]?.scrollIntoView({ behavior: "smooth", block: "start" })
    })
  }

  const handleConfirm = () => {
    // Mark any unanswered questions as touched so the user sees the required message.
    const touched: Record<string, boolean> = {}
    for (const q of questions) touched[q.id] = true
    setTouchedByQuestion(touched)
    if (!allAnswered) return
    onConfirm({ clarifications })
  }

  if (questions.length === 0) return null

  return (
    <div className="mt-3 flow-root space-y-3 rounded-lg border border-border bg-secondary/20 p-3 text-left isolate">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="font-normal">
            {t("plan_answer_required")}
          </Badge>
          <span className="text-xs text-muted-foreground">
            {t("plan_review_hint")}
          </span>
        </div>
        <Badge variant="secondary" className="text-[10px] font-normal">
          {activeIdx + 1}/{questions.length}
        </Badge>
      </div>

      <div className="space-y-3">
        {questions.map((q, idx) => {
          const choices = resolveChoices(q)
          const mode = selectionModeOf(q)
          const allowCustom = allowCustomOf(q)
          const isActive = idx === activeIdx
          const showError = touchedByQuestion[q.id] && !isAnswered(q)
          const picked = selectedLabels[q.id] ?? []
          const custom = customByQuestion[q.id] ?? ""
          return (
            <div
              key={q.id}
              ref={(el) => {
                questionRefs.current[q.id] = el
              }}
              className={cn(
                "space-y-2 rounded-md bg-card/40 p-2 border border-border/40 scroll-mt-24",
                !isActive && "opacity-60",
              )}
            >
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs text-foreground leading-snug break-words flex-1 min-w-0">{q.question}</p>
                <Badge variant="outline" className="text-[10px] shrink-0 font-normal">
                  {mode === "multi" ? "Pick one or more" : "Pick one"}
                </Badge>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {choices.map((c) => {
                  const on = picked.includes(c.label)
                  return (
                    <button
                      key={c.key}
                      type="button"
                      disabled={disabled}
                      onClick={() => toggleChoice(q, c.label)}
                      className={cn(
                        "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs transition-colors",
                        on
                          ? "border-foreground/30 bg-foreground/10 text-foreground"
                          : "border-border bg-card hover:bg-secondary/60 text-foreground/90",
                        disabled && "opacity-60 pointer-events-none",
                      )}
                    >
                      <span className="font-mono text-[10px] opacity-80">{c.letter}</span>
                      <span className="max-w-[22rem] truncate">{c.label}</span>
                    </button>
                  )
                })}
              </div>

              {allowCustom ? (
                <div className="pt-1">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px] font-normal shrink-0">
                      {t("plan_other_label")}
                    </Badge>
                    <Input
                      value={custom}
                      disabled={disabled}
                      placeholder={t("plan_other_placeholder")}
                      onChange={(e) => {
                        const v = e.target.value
                        setCustomByQuestion((prev) => ({ ...prev, [q.id]: v }))
                        setTouchedByQuestion((prev) => ({ ...prev, [q.id]: true }))
                      }}
                      className="h-8 text-xs"
                    />
                  </div>
                </div>
              ) : null}

              {showError ? (
                <p className="text-[11px] text-destructive">{t("plan_answer_required")}</p>
              ) : null}
            </div>
          )
        })}
      </div>

      <div className="flex items-center justify-between gap-2 pt-1">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled || activeIdx <= 0}
          onClick={() => setActiveIdx((i) => Math.max(0, i - 1))}
        >
          {prevLabel}
        </Button>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={disabled || activeIdx >= questions.length - 1}
            onClick={handleNext}
          >
            {nextLabel}
          </Button>
          <Button type="button" size="sm" disabled={disabled || !allAnswered} onClick={handleConfirm}>
            {continueLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}

