import { z } from "zod"
import { aiRequestFlagsSchema } from "@/lib/ai-request-flags"

/** Optional explicit A/B/C… option with stable id (planner may omit — UI derives letters from suggestedAnswers). */
export const planQuestionOptionSchema = z.object({
  id: z.string().min(1).max(8),
  label: z.string().min(1),
})

export type PlanQuestionOption = z.infer<typeof planQuestionOptionSchema>

/** One clarification question: single or multi pick, optional typed “other” answer. */
export const planQuestionSchema = z.object({
  id: z.string().min(1),
  question: z.string().min(1),
  /** Short chip labels (always present for backward compatibility). */
  suggestedAnswers: z.array(z.string().min(1)).min(1).max(8),
  /** When set, overrides display order/labels; ids should be A,B,C,D when possible. */
  options: z.array(planQuestionOptionSchema).max(8).optional(),
  selectionMode: z.enum(["single", "multi"]).default("single"),
  allowCustomAnswer: z.boolean().default(true),
})

export type PlanQuestion = z.infer<typeof planQuestionSchema>

/** A primary surface / route in the SPA (implemented as view state, not real URLs). */
export const planViewSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  description: z.string().optional(),
})

export type PlanView = z.infer<typeof planViewSchema>

/**
 * Frozen specification the user approves before codegen.
 * Kept JSON-serializable for localStorage and API bodies.
 */
export const planSnapshotSchema = z.object({
  summary: z.string().min(1),
  industry: z.string().min(1),
  assumptions: z.array(z.string()).max(20),
  openQuestions: z.array(planQuestionSchema).max(8),
  informationArchitecture: z.object({
    views: z.array(planViewSchema).min(1).max(16),
  }),
  buildTodos: z.array(z.string().min(1)).min(2).max(24),
  designNotes: z.string().min(1),
  /** Short tokens for imagery and demo copy (e.g. "pokemon-card", "incense", "HK"). */
  visualThemeKeywords: z.array(z.string().min(1)).max(12).optional(),
})

export type PlanSnapshot = z.infer<typeof planSnapshotSchema>

export const planResponseSchema = z.object({
  reply: z.string().min(1),
  plan: planSnapshotSchema,
})

export type PlanResponse = z.infer<typeof planResponseSchema>

export const planRequestSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string(),
      }),
    )
    .min(1),
  clarifications: z
    .array(
      z.object({
        questionId: z.string().min(1),
        answer: z.string().min(1),
      }),
    )
    .max(16)
    .optional(),
  flags: aiRequestFlagsSchema.optional(),
})

export type PlanRequest = z.infer<typeof planRequestSchema>
