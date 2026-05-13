/**
 * Parses JSON from an LLM reply; tolerates occasional ``` fences or leading prose.
 */
export function parseModelJsonObject(text: string): unknown {
  const t = text.trim()
  const candidates: string[] = [t]
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence?.[1]) candidates.push(fence[1].trim())
  const obj = t.match(/\{[\s\S]*\}/)
  if (obj?.[0]) candidates.push(obj[0].trim())

  for (const candidate of candidates) {
    const parsed = tryParseWithRepair(candidate)
    if (parsed.ok) return parsed.value
  }
  throw new Error("Model did not return valid JSON")
}

/**
 * Try strict parse first, then retry with repaired escape/newline issues.
 * Input: raw JSON candidate string.
 * Output: parsed value and success flag.
 * Side effects: none.
 */
function tryParseWithRepair(candidate: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(candidate) as unknown }
  } catch {
    try {
      return { ok: true, value: JSON.parse(repairMalformedJson(candidate)) as unknown }
    } catch {
      return { ok: false }
    }
  }
}

/**
 * Repair common model JSON defects:
 * - invalid escape sequences inside strings (e.g. "\_")
 * - raw newlines/carriage returns inside string literals.
 * Input: malformed JSON-like text.
 * Output: safer JSON text for a second parse attempt.
 * Side effects: none.
 */
function repairMalformedJson(input: string): string {
  const validEscapes = new Set(['"', "\\", "/", "b", "f", "n", "r", "t", "u"])
  let out = ""
  let inString = false

  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i]
    if (!inString) {
      out += ch
      if (ch === '"') inString = true
      continue
    }

    if (ch === "\\") {
      const next = input[i + 1]
      if (next == null) {
        out += "\\\\"
        continue
      }
      if (validEscapes.has(next)) {
        out += `\\${next}`
      } else {
        // Turn invalid "\x" into literal backslash + "x".
        out += `\\\\${next}`
      }
      i += 1
      continue
    }

    if (ch === '"') {
      inString = false
      out += ch
      continue
    }

    if (ch === "\n") {
      out += "\\n"
      continue
    }
    if (ch === "\r") {
      out += "\\r"
      continue
    }

    out += ch
  }
  return out
}
