"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import type { PlanQuestion, PlanSnapshot } from "@/lib/plan-schema"
import { CheckCircle2, Hammer, ListTodo, Map, PencilLine } from "lucide-react"
import { cn } from "@/lib/utils"
import { useI18n } from "@/components/i18n-context"

export interface PlanReviewCardProps {
  plan: PlanSnapshot
  disabled?: boolean
  onConfirmBuild: (args: {
    clarifications: { questionId: string; answer: string }[]
  }) => void
  onRevisePlan: () => void
}

type ResolvedChoice = { key: string; letter: string; label: string }

/** Build stable A/B/C… rows from explicit options or suggestedAnswers order. */
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

/**
 * Shows the approved plan structure, A–D style choices (single or multi), optional “Other” text, and build actions.
 */
export function PlanReviewCard({ plan, disabled, onConfirmBuild, onRevisePlan }: PlanReviewCardProps) {
  const { t } = useI18n()
  /** Selected answer labels per question (single = at most one). */
  const [selectedLabels, setSelectedLabels] = useState<Record<string, string[]>>({})
  const [customByQuestion, setCustomByQuestion] = useState<Record<string, string>>({})
  const [activeIdx, setActiveIdx] = useState(0)
  const [touchedByQuestion, setTouchedByQuestion] = useState<Record<string, boolean>>({})
  const questionRefs = useRef<Record<string, HTMLDivElement | null>>({})

  useEffect(() => {
    // Reset when plan changes.
    setActiveIdx(0)
    setTouchedByQuestion({})
    setSelectedLabels({})
    setCustomByQuestion({})
  }, [plan])

  const questions = plan.openQuestions

  const clarifications = useMemo(() => {
    return plan.openQuestions
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
  }, [plan.openQuestions, selectedLabels, customByQuestion])

  const isAnswered = (q: PlanQuestion): boolean => {
    const picked = selectedLabels[q.id] ?? []
    const custom = (customByQuestion[q.id] ?? "").trim()
    return picked.length > 0 || custom.length > 0
  }

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

    // Auto-advance if this question is now answered.
    requestAnimationFrame(() => {
      if (!isAnswered(q)) return
      const nextIdx = Math.min(activeIdx + 1, questions.length - 1)
      if (nextIdx === activeIdx) return
      setActiveIdx(nextIdx)
      const nextQ = questions[nextIdx]
      const node = questionRefs.current[nextQ.id]
      node?.scrollIntoView({ behavior: "smooth", block: "start" })
    })
  }

  const isChoiceOn = (q: PlanQuestion, label: string) => (selectedLabels[q.id] ?? []).includes(label)

  return (
    <div
      data-plan-review-card
      className="mt-3 flow-root space-y-4 rounded-lg border border-border bg-secondary/20 p-3 text-left isolate"
    >
      <header className="space-y-2 relative z-0">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="gap-1 font-normal">
            <Map className="size-3 shrink-0" />
            {plan.industry}
          </Badge>
          <span className="text-xs text-muted-foreground">{t("plan_review_hint")}</span>
        </div>
        <p className="text-sm text-foreground leading-relaxed">{plan.summary}</p>
      </header>

      <section className="space-y-2 relative z-0" aria-labelledby="plan-checklist-heading">
        <p id="plan-checklist-heading" className="text-xs font-medium text-muted-foreground flex items-center gap-1">
          <ListTodo className="size-3 shrink-0" />
          Build checklist
        </p>
        <div
          className={cn(
            "max-h-40 min-h-0 overflow-y-auto overscroll-y-contain rounded-md border border-border/60 bg-card/80",
            "px-3 py-2 shadow-inner",
          )}
        >
          <ol className="list-decimal list-outside space-y-2 pl-5 text-xs text-muted-foreground leading-snug">
            {plan.buildTodos.map((t, i) => (
              <li key={i} className="break-words pl-0.5">
                {t}
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="space-y-2 relative z-0" aria-labelledby="plan-views-heading">
        <p id="plan-views-heading" className="text-xs font-medium text-muted-foreground flex items-center gap-1">
          <CheckCircle2 className="size-3 shrink-0" />
          Views / screens
        </p>
        <div className="flex flex-wrap gap-1.5">
          {plan.informationArchitecture.views.map((v) => (
            <Badge key={v.id} variant="secondary" className="text-xs font-normal max-w-full truncate">
              {v.label}
            </Badge>
          ))}
        </div>
      </section>

      {plan.openQuestions.length > 0 ? (
        <section className="space-y-3 relative z-0 border-t border-border/50 pt-3" aria-label="Clarifications">
          <p className="text-xs font-medium text-muted-foreground">
            Clarifications — tap <span className="font-mono text-foreground">A–D</span> (multi-select where noted) or use
            &quot;Other&quot;.
          </p>
          {plan.openQuestions.map((q, idx) => {
            const choices = resolveChoices(q)
            const mode = selectionModeOf(q)
            const allowCustom = true
            const isActive = idx === activeIdx
            const showError = touchedByQuestion[q.id] && !isAnswered(q)
            return (
              <div
                key={q.id}
                ref={(el) => {
                  questionRefs.current[q.id] = el
                }}
                className={cn(
                  "space-y-2 rounded-md bg-card/40 p-2 border border-border/40",
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
                  {choices.map((c) => (
                    <button
                      key={c.key}
                      type="button"
                      disabled={disabled || !isActive}
                      onClick={() => toggleChoice(q, c.label)}
                      className={cn(
                        "rounded-lg border px-2 py-1.5 text-left text-xs transition-colors max-w-full break-words flex items-start gap-2 min-w-0",
                        isChoiceOn(q, c.label)
                          ? "border-accent bg-accent/15 text-accent"
                          : "border-border bg-card hover:bg-secondary",
                      )}
                    >
                      <span className="font-mono font-semibold shrink-0 w-5 text-center">{c.letter}</span>
                      <span className="min-w-0">{c.label}</span>
                    </button>
                  ))}
                </div>
                {allowCustom ? (
                  <div className="space-y-1 pt-1">
                    <label className="text-[10px] text-muted-foreground" htmlFor={`plan-custom-${q.id}`}>
                      {t("plan_other_label")}
                    </label>
                    <Input
                      id={`plan-custom-${q.id}`}
                      disabled={disabled || !isActive}
                      placeholder={t("plan_other_placeholder")}
                      value={customByQuestion[q.id] ?? ""}
                      onChange={(e) =>
                        setCustomByQuestion((prev) => ({
                          ...prev,
                          [q.id]: e.target.value,
                        }))
                      }
                      onBlur={() => setTouchedByQuestion((prev) => ({ ...prev, [q.id]: true }))}
                      className="h-8 text-xs"
                    />
                  </div>
                ) : null}
                {showError ? (
                  <p className="text-[11px] text-destructive">{t("plan_answer_required")}</p>
                ) : null}

                {isActive && questions.length > 1 ? (
                  <div className="pt-1 flex items-center justify-end gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8"
                      disabled={disabled || idx === 0}
                      onClick={() => {
                        const next = Math.max(0, activeIdx - 1)
                        setActiveIdx(next)
                        const q2 = questions[next]
                        questionRefs.current[q2.id]?.scrollIntoView({ behavior: "smooth", block: "start" })
                      }}
                    >
                      Previous
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      className="h-8 bg-accent text-accent-foreground hover:bg-accent/90"
                      disabled={disabled || !isAnswered(q) || idx === questions.length - 1}
                      onClick={() => {
                        setTouchedByQuestion((prev) => ({ ...prev, [q.id]: true }))
                        if (!isAnswered(q)) return
                        const next = Math.min(questions.length - 1, activeIdx + 1)
                        setActiveIdx(next)
                        const q2 = questions[next]
                        questionRefs.current[q2.id]?.scrollIntoView({ behavior: "smooth", block: "start" })
                      }}
                    >
                      Next
                    </Button>
                  </div>
                ) : null}
              </div>
            )
          })}
        </section>
      ) : null}

      {plan.assumptions.length > 0 ? (
        <details className="text-xs text-muted-foreground relative z-0 border-t border-border/50 pt-2">
          <summary className="cursor-pointer select-none text-foreground/80">Assumptions</summary>
          <ul className="mt-2 list-disc pl-4 space-y-1 break-words">
            {plan.assumptions.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </details>
      ) : null}

      <footer className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end pt-2 border-t border-border/50 relative z-10 bg-secondary/20 -mx-3 -mb-3 mt-1 px-3 py-3 rounded-b-lg">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1"
          disabled={disabled}
          onClick={onRevisePlan}
        >
          <PencilLine className="size-3.5 shrink-0" />
          Revise plan
        </Button>
        <Button
          type="button"
          size="sm"
          className="gap-1 bg-accent text-accent-foreground hover:bg-accent/90"
          disabled={disabled || !allAnswered}
          onClick={() => onConfirmBuild({ clarifications })}
        >
          <Hammer className="size-3.5 shrink-0" />
          Confirm &amp; build
        </Button>
      </footer>
    </div>
  )
}
