/**
 * Parses JSON from an LLM reply; tolerates occasional ``` fences or leading prose.
 */
export function parseModelJsonObject(text: string): unknown {
  const t = text.trim()
  try {
    return JSON.parse(t) as unknown
  } catch {
    const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i)
    if (fence?.[1]) {
      return JSON.parse(fence[1].trim()) as unknown
    }
    const obj = t.match(/\{[\s\S]*\}/)
    if (obj) {
      return JSON.parse(obj[0]) as unknown
    }
    throw new Error("Model did not return valid JSON")
  }
}
