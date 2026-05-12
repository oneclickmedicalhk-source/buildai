/**
 * Fixes model-generated TSX where `<=` or `>=` appears in JSX text. Raw `<` / `>` break the
 * JSX lexer; esbuild may point the error column at `<`, `=`, or `>` depending on version.
 * We replace with Unicode ≤ (U+2264) / ≥ (U+2265) so the bundle succeeds and meaning stays clear.
 */
import path from "path"
import type * as esbuild from "esbuild"

/**
 * Maps an absolute path from an esbuild diagnostic to our virtual `/path.tsx` key.
 */
export function virtualPathFromEsbuildFile(tmpDir: string, file: string): string | null {
  const normalizedTmp = path.resolve(tmpDir)
  /** esbuild often reports `App.tsx` relative to absWorkingDir, not an absolute path. */
  const resolved = path.isAbsolute(file) ? path.resolve(file) : path.resolve(normalizedTmp, file)
  const rel = path.relative(normalizedTmp, resolved)
  if (rel.startsWith("..") || rel.includes("__preview_entry__")) return null
  const posix = rel.split(path.sep).join("/")
  return posix.startsWith("/") ? posix : `/${posix}`
}

function sourceLineAt(full: string, line1: number): string {
  const lines = full.split("\n")
  const li = line1 - 1
  if (li < 0 || li >= lines.length) return ""
  return lines[li]
}

/** Normalize smart quotes so diagnostic strings match across locales / esbuild versions. */
function normalizeDiagnosticQuotes(text: string): string {
  return text
    .replace(/\u201c|\u201d/g, '"')
    .replace(/\u2018|\u2019/g, "'")
}

/**
 * Esbuild JSX parse errors when `<=` is read as a tag (message shape varies: identifier vs `>`).
 */
function looksLikeJsxLessEqualParseError(text: string): boolean {
  const t = normalizeDiagnosticQuotes(text)
  if (!t.includes("Expected") || !t.includes("found")) return false
  if (t.includes("Expected identifier but found")) return true
  if (/Expected\s*">"\s*but\s*found/i.test(t) || /Expected\s*'>'\s*but\s*found/i.test(t)) return true
  // Some builds emit slightly different wording; still require a `>` token in the message.
  if (/Expected[^\n]{0,120}found[^\n]{0,40}=/i.test(t) && />/.test(t)) return true
  return false
}

/** Esbuild messages that usually mean `<=` was parsed as JSX in plain text. */
function matchesLessEqualDiagnostic(m: esbuild.Message, sourceLine: string): boolean {
  if (!m.location) return false
  if (!looksLikeJsxLessEqualParseError(m.text ?? "")) return false
  // Location may drift by a line/column; don't require exact source-line comparator.
  // The downstream fallback fixer is constrained to JSX plain text nodes only.
  return true
}

/** Esbuild: "The character \">\" is not valid inside a JSX element" when `>=` sits in text. */
function matchesGreaterEqualDiagnostic(m: esbuild.Message, sourceLine: string): boolean {
  const text = m.text ?? ""
  if (!text.includes("not valid inside a JSX element")) return false
  return sourceLine.includes(">=")
}

/**
 * Replaces one `<=` on the error line: prefers esbuild's 0-based column when it points at `<` or `=`.
 */
export function applyLessEqualFixAtEsbuildLocation(
  code: string,
  loc: { line: number; column: number; lineText?: string },
): string {
  const lines = code.split("\n")
  const li = loc.line - 1
  if (li < 0 || li >= lines.length) return code
  let line = lines[li]
  const c = loc.column

  // Column can point at `<`, `=`, or a nearby token (UTF-16 / minifier / CRLF drift).
  if (typeof c === "number" && Number.isFinite(c)) {
    for (let d = -4; d <= 20; d++) {
      const i = c + d
      if (i >= 0 && line[i] === "<" && line[i + 1] === "=") {
        line = line.slice(0, i) + "\u2264" + line.slice(i + 2)
        lines[li] = line
        return lines.join("\n")
      }
    }
  }

  const idx = line.indexOf("<=")
  if (idx !== -1) {
    line = line.slice(0, idx) + "\u2264" + line.slice(idx + 2)
    lines[li] = line
    return lines.join("\n")
  }
  return code
}

/**
 * Replaces one `>=` on the error line (column often points at `>` of `>=`).
 */
export function applyGreaterEqualFixAtEsbuildLocation(
  code: string,
  loc: { line: number; column: number; lineText?: string },
): string {
  const lines = code.split("\n")
  const li = loc.line - 1
  if (li < 0 || li >= lines.length) return code
  let line = lines[li]
  const c = loc.column

  if (line[c] === ">" && line[c + 1] === "=") {
    line = line.slice(0, c) + "\u2265" + line.slice(c + 2)
    lines[li] = line
    return lines.join("\n")
  }
  if (c > 0 && line[c] === "=" && line[c - 1] === ">") {
    const at = c - 1
    line = line.slice(0, at) + "\u2265" + line.slice(at + 2)
    lines[li] = line
    return lines.join("\n")
  }

  const idx = line.indexOf(">=")
  if (idx !== -1) {
    line = line.slice(0, idx) + "\u2265" + line.slice(idx + 2)
    lines[li] = line
    return lines.join("\n")
  }
  return code
}

/**
 * Safety-net replacement when esbuild location mapping drifts:
 * only replace comparators inside plain JSX text nodes (`> ... <`),
 * never inside JSX expressions (`{ ... <= ... }`).
 */
function applyJsxTextComparatorFallback(code: string): string {
  const lines = code.split("\n")
  const next = lines.map((line) =>
    line
      .replace(/(>[^<{]*?)<=([^<{]*?<)/g, "$1\u2264$2")
      .replace(/(>[^<{]*?)>=([^<{]*?<)/g, "$1\u2265$2"),
  )
  return next.join("\n")
}

/**
 * Applies `<=` / `>=` JSX-text repairs for matching esbuild diagnostics. Returns a new map or null.
 */
export function applyEsbuildJsxCompareFixes(
  sources: Record<string, string>,
  tmpDir: string,
  messages: esbuild.Message[],
): Record<string, string> | null {
  let out: Record<string, string> | null = null
  const get = (k: string): string | undefined => (out ?? sources)[k]

  let changed = false
  for (const m of messages) {
    if (!m.location) continue
    const vp = virtualPathFromEsbuildFile(tmpDir, m.location.file)
    if (!vp) continue
    const prev = get(vp)
    if (typeof prev !== "string") continue

    const line = sourceLineAt(prev, m.location.line)
    let next = prev

    if (matchesLessEqualDiagnostic(m, line)) {
      const n = applyLessEqualFixAtEsbuildLocation(next, m.location)
      if (n !== next) {
        next = n
      } else {
        const n2 = applyJsxTextComparatorFallback(next)
        if (n2 !== next) next = n2
      }
    }
    if (matchesGreaterEqualDiagnostic(m, sourceLineAt(next, m.location.line))) {
      const n = applyGreaterEqualFixAtEsbuildLocation(next, m.location)
      if (n !== next) {
        next = n
      } else {
        const n2 = applyJsxTextComparatorFallback(next)
        if (n2 !== next) next = n2
      }
    }

    if (next !== prev) {
      if (!out) out = { ...sources }
      out[vp] = next
      changed = true
    }
  }

  // Final safety-net: if diagnostics indicate JSX-text comparator parse errors but
  // file/line mapping failed, apply constrained fallback across all source files.
  if (!changed) {
    const hasComparatorParseError = messages.some((m) =>
      looksLikeJsxLessEqualParseError(m.text ?? "") ||
      (m.text ?? "").includes("not valid inside a JSX element"),
    )
    if (hasComparatorParseError) {
      let fallbackChanged = false
      const fallbackOut: Record<string, string> = { ...sources }
      for (const [k, v] of Object.entries(sources)) {
        if (typeof v !== "string") continue
        const n = applyJsxTextComparatorFallback(v)
        if (n !== v) {
          fallbackOut[k] = n
          fallbackChanged = true
        }
      }
      if (fallbackChanged) return fallbackOut
    }
  }

  return changed ? out : null
}

/**
 * Models sometimes emit a bare `n` (broken `\\n`) immediately after a JSX closing tag or
 * self-closing tag, e.g. `</div>n\\n    <div>` → esbuild: `Expected ")" but found "n"`.
 * Remove that letter only when it sits right after `>` and before whitespace or `<`.
 */
const STRAY_AFTER_JSX_CLOSE = /(<\/[^>]+>)([nt])(?=\s|<|$)/g
const STRAY_AFTER_JSX_SELF_CLOSE = /(<[^>]*\/>)([nt])(?=\s|<|$)/g

function matchesStrayLetterAfterClose(m: esbuild.Message, sourceLine: string): boolean {
  if (!m.location) return false
  const t = normalizeDiagnosticQuotes(m.text ?? "")
  if (!/found\s+["']([nt])["']/i.test(t)) return false
  const col = m.location.column
  if (typeof col !== "number" || col < 0 || col >= sourceLine.length) return false
  const expected = t.match(/found\s+["']([nt])["']/i)?.[1]
  if (!expected || sourceLine[col] !== expected) return false
  const before = sourceLine.slice(0, col)
  return before.endsWith(">")
}

/**
 * Strips stray `n` / `t` after `</Tag>` or `/>` site-wide (bounded retries in preview-bundle).
 */
export function applyStrayLetterAfterJsxCloseInSource(code: string): string {
  return code.replace(STRAY_AFTER_JSX_CLOSE, "$1").replace(STRAY_AFTER_JSX_SELF_CLOSE, "$1")
}

/**
 * Applies stray-letter fixes when esbuild diagnostics match the known broken-`\\n` pattern.
 */
export function applyEsbuildStrayAfterCloseTagFixes(
  sources: Record<string, string>,
  tmpDir: string,
  messages: esbuild.Message[],
): Record<string, string> | null {
  let out: Record<string, string> | null = null
  const get = (k: string): string | undefined => (out ?? sources)[k]

  let changed = false
  for (const m of messages) {
    if (!m.location) continue
    const vp = virtualPathFromEsbuildFile(tmpDir, m.location.file)
    if (!vp) continue
    const prev = get(vp)
    if (typeof prev !== "string") continue
    const line = sourceLineAt(prev, m.location.line)
    if (!matchesStrayLetterAfterClose(m, line)) continue

    const next = applyStrayLetterAfterJsxCloseInSource(prev)
    if (next !== prev) {
      if (!out) out = { ...sources }
      out[vp] = next
      changed = true
    }
  }

  return changed ? out : null
}
