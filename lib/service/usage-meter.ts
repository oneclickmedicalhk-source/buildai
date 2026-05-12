import { resolveAiProviderForRequest } from "@/lib/ai-provider"
import type { AiProviderChoice, AiProviderId } from "@/lib/ai-provider"

export type UsageEstimate = {
  provider: AiProviderId
  model: string
  inputTokens: number
  outputTokens: number
  costUsd: number
  uncappedChargedUsd: number
  chargedUsd: number
  markup: number
  phase: UsagePhase
  maxChargePerCallUsd: number
}

type Rate = { inPer1k: number; outPer1k: number }
export type UsagePhase = "plan" | "generate" | "edit" | "runtime_repair"

// Provider unit prices are USD per 1K tokens.
// We keep these slightly conservative so credit estimates stay stable.
const COST_TABLE: Record<AiProviderId, Rate> = {
  openai: { inPer1k: 0.0025, outPer1k: 0.01 },
  vertex_gemini: { inPer1k: 0.0015, outPer1k: 0.005 },
  vertex_claude: { inPer1k: 0.003, outPer1k: 0.015 },
}

// Upper bound for one charge event (USD), by workflow phase.
const MAX_CHARGE_PER_CALL_USD: Record<UsagePhase, number> = {
  plan: 1.25,
  generate: 2.75,
  edit: 2.25,
  runtime_repair: 1.5,
}

// Keep user-facing pricing stable by workflow phase (target: plan+generate+edit ~= $5).
const MIN_CHARGE_PER_CALL_USD: Record<UsagePhase, number> = {
  plan: 0.8,
  generate: 2.2,
  edit: 1.8,
  runtime_repair: 0.75,
}

function ceilToCent(x: number): number {
  return Math.ceil(x * 100) / 100
}

function approxTokensFromText(s: string): number {
  // Rough heuristic: ~4 chars per token (varies by language).
  const n = s?.length ?? 0
  return Math.max(1, Math.ceil(n / 4))
}

function resolveMaxChargePerCallUsd(params: {
  phase?: UsagePhase
  maxChargePerCallUsd?: number
}): { phase: UsagePhase; maxChargePerCallUsd: number } {
  const phase = params.phase ?? "generate"
  const defaultCap = MAX_CHARGE_PER_CALL_USD[phase]
  const maxChargePerCallUsd = Math.max(0.25, params.maxChargePerCallUsd ?? defaultCap)
  return { phase, maxChargePerCallUsd }
}

function resolveMinChargePerCallUsd(phase: UsagePhase): number {
  return Math.max(0, MIN_CHARGE_PER_CALL_USD[phase] ?? 0)
}

export function estimateUsageAndCharge(params: {
  aiProviderChoice?: AiProviderChoice
  inputText: string
  outputText: string
  markupMin?: number
  modelLabel?: string
  phase?: UsagePhase
  maxChargePerCallUsd?: number
}): UsageEstimate {
  const provider = resolveAiProviderForRequest(params.aiProviderChoice)
  const rate = COST_TABLE[provider]
  const inputTokens = approxTokensFromText(params.inputText)
  const outputTokens = approxTokensFromText(params.outputText)
  const costUsd = (inputTokens / 1000) * rate.inPer1k + (outputTokens / 1000) * rate.outPer1k
  const markup = Math.max(params.markupMin ?? 5, 5)
  const { phase, maxChargePerCallUsd } = resolveMaxChargePerCallUsd({
    phase: params.phase,
    maxChargePerCallUsd: params.maxChargePerCallUsd,
  })
  const minChargePerCallUsd = resolveMinChargePerCallUsd(phase)
  const uncappedChargedUsd = ceilToCent(costUsd * markup)
  const floored = Math.max(uncappedChargedUsd, minChargePerCallUsd)
  const chargedUsd = Math.min(floored, maxChargePerCallUsd)
  return {
    provider,
    model: params.modelLabel ?? provider,
    inputTokens,
    outputTokens,
    costUsd,
    uncappedChargedUsd,
    chargedUsd,
    markup,
    phase,
    maxChargePerCallUsd,
  }
}

export function estimatePreauthChargeUsd(params: {
  aiProviderChoice?: AiProviderChoice
  inputText: string
  assumedOutputTokens: number
  markupMin?: number
  phase?: UsagePhase
  maxChargePerCallUsd?: number
}): number {
  const provider = resolveAiProviderForRequest(params.aiProviderChoice)
  const rate = COST_TABLE[provider]
  const inputTokens = approxTokensFromText(params.inputText)
  const outputTokens = Math.max(1, params.assumedOutputTokens)
  const costUsd = (inputTokens / 1000) * rate.inPer1k + (outputTokens / 1000) * rate.outPer1k
  const markup = Math.max(params.markupMin ?? 5, 5)
  const { maxChargePerCallUsd } = resolveMaxChargePerCallUsd({
    phase: params.phase,
    maxChargePerCallUsd: params.maxChargePerCallUsd,
  })
  const minChargePerCallUsd = resolveMinChargePerCallUsd(params.phase ?? "generate")
  const estimated = ceilToCent(costUsd * markup)
  return Math.min(Math.max(estimated, minChargePerCallUsd), maxChargePerCallUsd)
}

