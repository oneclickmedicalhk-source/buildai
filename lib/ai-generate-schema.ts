import { z } from "zod"
import { planSnapshotSchema } from "@/lib/plan-schema"
import { aiRequestFlagsSchema } from "@/lib/ai-request-flags"

export const generateRequestSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string(),
      }),
    )
    .min(1),
  flags: aiRequestFlagsSchema.optional(),
  /**
   * When refining an existing project (refineFrom + refineKind="edit"), prefer patches instead of full file rewrites.
   * Server may still return full sources after applying patches.
   */
  editOutput: z.enum(["auto", "full", "patch"]).optional(),
  /** User-approved plan from POST /api/plan — codegen must follow it. */
  approvedPlan: planSnapshotSchema.optional(),
  /** Optional answers to plan openQuestions (questionId matches plan). */
  clarifications: z
    .array(
      z.object({
        questionId: z.string(),
        answer: z.string(),
      }),
    )
    .optional(),
  /** When refineFrom is present, controls prompt mode: polish vs surgical edit. */
  refineKind: z.enum(["polish", "edit"]).optional(),
  /**
   * Phase D: polish existing bundle — server injects code into the user message and
   * enables polish instructions in the system prompt.
   */
  refineFrom: z
    .object({
      appTsx: z.string(),
      extraFiles: z.record(z.string()).optional(),
    })
    .optional(),
})

export type GenerateRequest = z.infer<typeof generateRequestSchema>

export const generateResponseSchema = z.object({
  reply: z.string(),
  appTsx: z.string(),
  extraFiles: z.record(z.string()).optional(),
  /** Optional list of files changed (useful for UI summaries). */
  changedFiles: z.array(z.string()).optional(),
  billing: z
    .object({
      phase: z.enum(["plan", "generate", "edit", "runtime_repair"]),
      preauthUsd: z.number(),
      chargedUsd: z.number(),
      uncappedChargedUsd: z.number(),
      firstBuildDiscountUsd: z.number().optional(),
      firstBuildCapApplied: z.boolean().optional(),
    })
    .optional(),
})

export type GenerateResponse = z.infer<typeof generateResponseSchema>
