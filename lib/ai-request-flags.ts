import { z } from "zod"
import { uiStyleKitSchema } from "@/lib/ui-style-kit"
import { themeIdSchema } from "@/lib/theme/theme-types"

/**
 * Shared optional flags for POST /api/plan and POST /api/generate (JSON body.flags).
 */
export const aiRequestFlagsSchema = z.object({
  supabaseConfigured: z.boolean().optional(),
  /** Per-request model routing; omit or "auto" uses server env + `resolveAiProvider()`. */
  aiProvider: z.enum(["auto", "openai", "vertex_claude", "vertex_gemini"]).optional(),
  /** UI language hint to localize planner output (reply, plan, questions). */
  uiLang: z.enum(["en", "zh-HK"]).optional(),
  /** Optional visual framework preset (appended to system prompts). */
  uiStyleKit: uiStyleKitSchema.optional(),
  /** Visual palette/mood preset; `auto` infers from prompt + plan keywords. */
  themeId: themeIdSchema.optional(),
  /** Optional per-theme texture variant; `auto` infers from prompt + keywords. */
  themeVariantId: z
    .enum([
      "auto",
      "neon_glow",
      "neon_holo",
      "natural_paper",
      "natural_botanical",
      "studio_spotlight",
      "minimal_plain",
    ])
    .optional(),
})

export type AiRequestFlags = z.infer<typeof aiRequestFlagsSchema>
