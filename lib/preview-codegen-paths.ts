import path from "path"

const CODE_EXT = /\.(tsx|ts|jsx|js)$/

/** Virtual paths allowed on disk for the preview temp workspace. */
export function isCodegenDiskPath(p: string): boolean {
  if (!p.startsWith("/") || p.includes("..")) return false
  if (p.startsWith("/node_modules")) return false
  return CODE_EXT.test(p)
}

/**
 * Models often emit extraFiles keys without extensions (e.g. "/components/ProductCard").
 * esbuild resolves "./components/ProductCard" to ProductCard.tsx on disk — we must write that.
 */
export function buildPreviewSourcesMap(files: Record<string, string>): Record<string, string> {
  const merged: Record<string, string> = {}
  for (const [k, v] of Object.entries(files)) {
    if (isCodegenDiskPath(k)) merged[k] = v
  }
  for (const [k, v] of Object.entries(files)) {
    if (isCodegenDiskPath(k)) continue
    if (!k.startsWith("/") || k.includes("..") || k.startsWith("/node_modules")) continue
    const base = path.posix.basename(k)
    if (base.includes(".")) continue
    const nk = `${k}.tsx`
    if (isCodegenDiskPath(nk) && merged[nk] === undefined) merged[nk] = v
  }
  return merged
}

function collectRelativeImportSpecs(source: string): string[] {
  const out = new Set<string>()
  const relFrom = /\bfrom\s+["'](\.[^"']+)["']/g
  const relImportOnly = /^import\s+["'](\.[^"']+)["']\s*;/gm
  const relExportFrom = /\bexport\s+[\s\S]*?\bfrom\s+["'](\.[^"']+)["']/g
  for (const re of [relFrom, relImportOnly, relExportFrom]) {
    re.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(source))) out.add(m[1])
  }
  return [...out]
}

function resolvesVirtualImport(
  fromFile: string,
  spec: string,
  sources: Record<string, string>,
): boolean {
  const fromDir = path.posix.dirname(fromFile)
  const joined = path.posix.normalize(path.posix.join(fromDir, spec))
  const candidates = [
    joined,
    `${joined}.tsx`,
    `${joined}.ts`,
    `${joined}.jsx`,
    `${joined}.js`,
    path.posix.join(joined, "index.tsx"),
    path.posix.join(joined, "index.ts"),
    path.posix.join(joined, "index.jsx"),
    path.posix.join(joined, "index.js"),
  ]
  return candidates.some((c) => sources[c] !== undefined)
}

/**
 * Returns a human-readable message if any relative import cannot be satisfied by `sources`.
 */
export function describeMissingRelativeImports(sources: Record<string, string>): string | null {
  const missing: string[] = []
  for (const file of Object.keys(sources)) {
    if (!isCodegenDiskPath(file)) continue
    const body = sources[file]
    for (const spec of collectRelativeImportSpecs(body)) {
      if (!spec.startsWith(".")) continue
      // Styles are stripped in the preview bundler; paths may exist only as non-TS sandpack files.
      if (/\.(css|scss|sass|less)$/i.test(spec)) continue
      if (!resolvesVirtualImport(file, spec, sources)) {
        missing.push(`${file} → ${spec}`)
      }
    }
  }
  if (!missing.length) return null
  const cap = 14
  const head = missing.slice(0, cap)
  const tail = missing.length > cap ? `\n… and ${missing.length - cap} more` : ""
  return `${head.join("\n")}${tail}`
}
