import { resolveAiProviderForRequest } from "@/lib/ai-provider"
import type { AiProviderChoice, AiProviderId } from "@/lib/ai-provider"

export type UsageEstimate = {
  provider: AiProviderId
  model: string
  inputTokens: number
  outputTokens: number
  costUsd: number
  chargedUsd: number
  markup: number
}

type Rate = { inPer1k: number; outPer1k: number }

// Keep this conservative; update anytime.
const COST_TABLE: Record<AiProviderId, Rate> = {
  openai: { inPer1k: 0.15, outPer1k: 0.60 }, // placeholder conservative estimate
  vertex_gemini: { inPer1k: 0.05, outPer1k: 0.20 },
  vertex_claude: { inPer1k: 0.30, outPer1k: 1.20 },
}

function ceilToCent(x: number): number {
  return Math.ceil(x * 100) / 100
}

function approxTokensFromText(s: string): number {
  // Rough heuristic: ~4 chars per token (varies by language).
  const n = s?.length ?? 0
  return Math.max(1, Math.ceil(n / 4))
}

export function estimateUsageAndCharge(params: {
  aiProviderChoice?: AiProviderChoice
  inputText: string
  outputText: string
  markupMin?: number
  modelLabel?: string
}): UsageEstimate {
  const provider = resolveAiProviderForRequest(params.aiProviderChoice)
  const rate = COST_TABLE[provider]
  const inputTokens = approxTokensFromText(params.inputText)
  const outputTokens = approxTokensFromText(params.outputText)
  const costUsd = (inputTokens / 1000) * rate.inPer1k + (outputTokens / 1000) * rate.outPer1k
  const markup = Math.max(params.markupMin ?? 5, 5)
  const chargedUsd = ceilToCent(costUsd * markup)
  return {
    provider,
    model: params.modelLabel ?? provider,
    inputTokens,
    outputTokens,
    costUsd,
    chargedUsd,
    markup,
  }
}

export function estimatePreauthChargeUsd(params: {
  aiProviderChoice?: AiProviderChoice
  inputText: string
  assumedOutputTokens: number
  markupMin?: number
}): number {
  const provider = resolveAiProviderForRequest(params.aiProviderChoice)
  const rate = COST_TABLE[provider]
  const inputTokens = approxTokensFromText(params.inputText)
  const outputTokens = Math.max(1, params.assumedOutputTokens)
  const costUsd = (inputTokens / 1000) * rate.inPer1k + (outputTokens / 1000) * rate.outPer1k
  const markup = Math.max(params.markupMin ?? 5, 5)
  return ceilToCent(costUsd * markup)
}

