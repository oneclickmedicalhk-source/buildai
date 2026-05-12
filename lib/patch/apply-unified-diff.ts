type UnifiedDiffHunk = {
  oldStart: number
  oldCount: number
  newStart: number
  newCount: number
  lines: string[]
}

type UnifiedDiffFile = {
  path: string
  hunks: UnifiedDiffHunk[]
  isNewFile: boolean
  isDeleteFile: boolean
}

function parseHunkHeader(header: string): {
  oldStart: number
  oldCount: number
  newStart: number
  newCount: number
} {
  // @@ -a,b +c,d @@
  const m = header.match(/^@@\s*-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s*@@/)
  if (!m) throw new Error(`Invalid hunk header: ${header}`)
  return {
    oldStart: Number(m[1]),
    oldCount: m[2] ? Number(m[2]) : 1,
    newStart: Number(m[3]),
    newCount: m[4] ? Number(m[4]) : 1,
  }
}

function normalizeVirtualPath(p: string): string {
  const s = p.trim()
  if (!s) throw new Error("Empty patch path")
  if (s === "/dev/null") return s
  const out = s.startsWith("/") ? s : `/${s}`
  if (out.includes("..")) throw new Error(`Blocked path: ${out}`)
  if (out.startsWith("/node_modules")) throw new Error(`Blocked path: ${out}`)
  return out
}

function parseUnifiedDiff(diff: string): UnifiedDiffFile[] {
  const lines = diff.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n")
  const files: UnifiedDiffFile[] = []

  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (!line || (!line.startsWith("--- ") && !line.startsWith("diff --git "))) {
      i++
      continue
    }

    // Support either "diff --git a/x b/x" or plain ---/+++ pairs.
    if (line.startsWith("diff --git ")) {
      i++
      continue
    }

    if (!line.startsWith("--- ")) {
      i++
      continue
    }

    const oldRaw = line.slice(4).trim().split(/\s+/)[0] ?? ""
    const next = lines[i + 1] ?? ""
    if (!next.startsWith("+++ ")) throw new Error("Patch missing +++ header")
    const newRaw = next.slice(4).trim().split(/\s+/)[0] ?? ""

    const oldPath = normalizeVirtualPath(oldRaw.replace(/^a\//, "").replace(/^b\//, ""))
    const newPath = normalizeVirtualPath(newRaw.replace(/^a\//, "").replace(/^b\//, ""))

    const isNewFile = oldPath === "/dev/null" && newPath !== "/dev/null"
    const isDeleteFile = newPath === "/dev/null" && oldPath !== "/dev/null"
    const path = isDeleteFile ? oldPath : newPath
    if (path === "/dev/null") throw new Error("Patch file path resolved to /dev/null")

    i += 2
    const hunks: UnifiedDiffHunk[] = []
    while (i < lines.length) {
      const l = lines[i]
      if (l.startsWith("--- ")) break
      if (l.startsWith("@@")) {
        const hdr = parseHunkHeader(l)
        i++
        const hunkLines: string[] = []
        while (i < lines.length) {
          const hl = lines[i]
          if (hl.startsWith("@@") || hl.startsWith("--- ")) break
          if (hl.startsWith("\\ No newline at end of file")) {
            i++
            continue
          }
          hunkLines.push(hl)
          i++
        }
        hunks.push({ ...hdr, lines: hunkLines })
        continue
      }
      i++
    }

    files.push({ path, hunks, isNewFile, isDeleteFile })
  }

  if (!files.length) {
    throw new Error("No files found in unified diff")
  }
  return files
}

function splitLinesPreserveFinalNewline(source: string): { lines: string[]; endsWithNewline: boolean } {
  const normalized = source.replace(/\r\n/g, "\n").replace(/\r/g, "\n")
  const endsWithNewline = normalized.endsWith("\n")
  const lines = normalized.split("\n")
  // When endsWithNewline, split() produces a final "" line; keep it to preserve semantics.
  return { lines, endsWithNewline }
}

function joinLines(lines: string[], endsWithNewline: boolean): string {
  let out = lines.join("\n")
  if (!endsWithNewline && out.endsWith("\n")) out = out.slice(0, -1)
  if (endsWithNewline && !out.endsWith("\n")) out += "\n"
  return out
}

function linesEqual(a: string, b: string): boolean {
  // Model-generated diffs often drift on trailing spaces only.
  return a === b || a.trimEnd() === b.trimEnd()
}

function hunkAnchorLines(hunk: UnifiedDiffHunk): string[] {
  return hunk.lines
    .filter((l) => l.startsWith(" ") || l.startsWith("-"))
    .map((l) => l.slice(1))
}

function locateHunkStartByAnchor(base: string[], hunk: UnifiedDiffHunk, fallbackIdx: number): number {
  const anchor = hunkAnchorLines(hunk)
  if (!anchor.length) return fallbackIdx
  const maxStart = Math.max(0, base.length - 1)
  const candidates = new Set<number>([fallbackIdx])

  // Strategy 1: full contiguous anchor match (best quality signal).
  const fullMax = Math.max(0, base.length - anchor.length)
  for (let s = 0; s <= fullMax; s++) {
    let ok = true
    for (let i = 0; i < anchor.length; i++) {
      if (!linesEqual(base[s + i] ?? "", anchor[i])) {
        ok = false
        break
      }
    }
    if (ok) candidates.add(s)
  }

  // Strategy 2: single-line anchor fallbacks for offset-heavy edits.
  const first = anchor[0]
  const last = anchor[anchor.length - 1]
  for (let i = 0; i <= maxStart; i++) {
    if (linesEqual(base[i] ?? "", first)) candidates.add(i)
    if (linesEqual(base[i] ?? "", last)) candidates.add(Math.max(0, i - anchor.length + 1))
  }

  const ordered = [...candidates]
    .filter((n) => Number.isFinite(n))
    .map((n) => Math.max(0, Math.min(maxStart, n)))
    .sort((a, b) => Math.abs(a - fallbackIdx) - Math.abs(b - fallbackIdx))

  return ordered[0] ?? fallbackIdx
}

function applyHunkAtIndex(base: string[], hunk: UnifiedDiffHunk, startIdx: number): string[] {
  let idx = Math.max(0, startIdx)
  const out: string[] = []
  out.push(...base.slice(0, idx))

  for (const l of hunk.lines) {
    const kind = l.slice(0, 1)
    const text = l.slice(1)
    if (kind === " ") {
      const cur = base[idx] ?? ""
      if (!linesEqual(cur, text)) {
        throw new Error(
          `Patch context mismatch at line ${idx + 1}: expected ${JSON.stringify(text)} got ${JSON.stringify(cur)}`,
        )
      }
      out.push(cur)
      idx++
    } else if (kind === "-") {
      const cur = base[idx] ?? ""
      if (!linesEqual(cur, text)) {
        throw new Error(
          `Patch delete mismatch at line ${idx + 1}: expected ${JSON.stringify(text)} got ${JSON.stringify(cur)}`,
        )
      }
      idx++
    } else if (kind === "+") {
      out.push(text)
    } else if (l === "") {
      // allow empty line (treated as context without prefix in some model outputs)
      const cur = base[idx] ?? ""
      if (cur !== "") {
        throw new Error(`Patch context mismatch at line ${idx + 1}: expected empty line`)
      }
      out.push(cur)
      idx++
    } else {
      throw new Error(`Invalid hunk line: ${l}`)
    }
  }

  out.push(...base.slice(idx))
  return out
}

function applyHunkToLines(base: string[], hunk: UnifiedDiffHunk): string[] {
  // oldStart is 1-based.
  const expectedIdx = Math.max(0, hunk.oldStart - 1)
  const firstErr: unknown[] = []
  const starts = new Set<number>([expectedIdx, locateHunkStartByAnchor(base, hunk, expectedIdx)])
  const ordered = [...starts].sort((a, b) => Math.abs(a - expectedIdx) - Math.abs(b - expectedIdx))
  for (const startIdx of ordered) {
    try {
      return applyHunkAtIndex(base, hunk, startIdx)
    } catch (e) {
      firstErr.push(e)
    }
  }

  // Last attempt: probe local area around expected index.
  const window = 60
  for (let s = Math.max(0, expectedIdx - window); s <= Math.min(base.length, expectedIdx + window); s++) {
    if (starts.has(s)) continue
    try {
      return applyHunkAtIndex(base, hunk, s)
    } catch {
      // keep probing
    }
  }

  try {
    return applyHunkAtIndex(base, hunk, expectedIdx)
  } catch {
    throw (firstErr[0] as Error) ?? new Error("Failed to apply hunk")
  }
}

export type ApplyUnifiedDiffResult = {
  patched: Record<string, string>
  created: string[]
  deleted: string[]
  changed: string[]
}

/**
 * Applies a unified diff that may touch multiple files.
 * - Supports new files via --- /dev/null +++ /path
 * - Supports deletes via --- /path +++ /dev/null
 */
export function applyUnifiedDiffToVirtualFiles(
  files: Record<string, string>,
  diff: string,
): ApplyUnifiedDiffResult {
  const parsed = parseUnifiedDiff(diff)
  const patched: Record<string, string> = { ...files }
  const created: string[] = []
  const deleted: string[] = []
  const changed: string[] = []

  for (const f of parsed) {
    const path = f.path
    if (f.isDeleteFile) {
      if (patched[path] !== undefined) {
        delete patched[path]
        deleted.push(path)
        changed.push(path)
      }
      continue
    }

    const base = patched[path]
    if (base === undefined && !f.isNewFile) {
      throw new Error(`Patch targets missing file: ${path}`)
    }

    const baseSource = base ?? ""
    const { lines: baseLines, endsWithNewline } = splitLinesPreserveFinalNewline(baseSource)
    let nextLines = baseLines
    for (const h of f.hunks) {
      nextLines = applyHunkToLines(nextLines, h)
    }
    const nextSource = joinLines(nextLines, endsWithNewline || f.isNewFile)
    patched[path] = nextSource

    if (f.isNewFile && base === undefined) created.push(path)
    changed.push(path)
  }

  return { patched, created, deleted, changed }
}

