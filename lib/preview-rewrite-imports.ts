import path from "path"

function posixRelativeImport(fromVirtual: string, absoluteVirtualTarget: string): string {
  const fromDir = path.posix.dirname(fromVirtual)
  let rel = path.posix.relative(fromDir, absoluteVirtualTarget)
  if (rel === "") rel = "."
  if (!rel.startsWith(".")) rel = `./${rel}`
  return rel
}

function isBlockedRootTarget(absPath: string): boolean {
  return absPath.startsWith("/node_modules")
}

/**
 * The model sometimes emits imports rooted at "/" (e.g. `from "/components/Foo"`).
 * In the preview temp workspace those must be relative to the current file so esbuild can resolve them.
 */
export function rewriteLeadingSlashModuleSpecifiers(virtualPath: string, source: string): string {
  const toRelative = (spec: string): string | null => {
    if (!spec.startsWith("/") || spec.startsWith("//")) return null
    if (isBlockedRootTarget(spec)) return null
    return posixRelativeImport(virtualPath, spec)
  }

  let out = source

  out = out.replace(/\bfrom\s+(["'])(\/[^"']+)\1/g, (full, q: string, spec: string) => {
    const r = toRelative(spec)
    return r === null ? full : `from ${q}${r}${q}`
  })

  out = out.replace(/\bimport\s*\(\s*(["'])(\/[^"']+)\1\s*\)/g, (full, q: string, spec: string) => {
    const r = toRelative(spec)
    return r === null ? full : `import(${q}${r}${q})`
  })

  out = out.replace(/\brequire\s*\(\s*(["'])(\/[^"']+)\1\s*\)/g, (full, q: string, spec: string) => {
    const r = toRelative(spec)
    return r === null ? full : `require(${q}${r}${q})`
  })

  out = out.replace(/(\bexport\s+[\s\S]*?\bfrom\s+)(["'])(\/[^"']+)\2/g, (full, prefix, q: string, spec: string) => {
    const r = toRelative(spec)
    return r === null ? full : `${prefix}${q}${r}${q}`
  })

  out = out.replace(/\bimport\s+(["'])(\/[^"']+)\1(?=\s*;)/g, (full, q: string, spec: string) => {
    const r = toRelative(spec)
    return r === null ? full : `import ${q}${r}${q}`
  })

  return out
}

/**
 * Map `from "@/components/Foo"` → same as virtual absolute `/components/Foo`, then make relative.
 */
export function rewriteAtAliasModuleSpecifiers(virtualPath: string, source: string): string {
  const toRelative = (rest: string): string | null => {
    const abs = `/${rest.replace(/^\/+/, "")}`
    if (isBlockedRootTarget(abs)) return null
    return posixRelativeImport(virtualPath, abs)
  }

  let out = source

  out = out.replace(/\bfrom\s+(["'])@\/([^"']+)\1/g, (full, q: string, rest: string) => {
    const r = toRelative(rest)
    return r === null ? full : `from ${q}${r}${q}`
  })

  out = out.replace(/\bimport\s*\(\s*(["'])@\/([^"']+)\1\s*\)/g, (full, q: string, rest: string) => {
    const r = toRelative(rest)
    return r === null ? full : `import(${q}${r}${q})`
  })

  out = out.replace(/\brequire\s*\(\s*(["'])@\/([^"']+)\1\s*\)/g, (full, q: string, rest: string) => {
    const r = toRelative(rest)
    return r === null ? full : `require(${q}${r}${q})`
  })

  out = out.replace(/(\bexport\s+[\s\S]*?\bfrom\s+)(["'])@\/([^"']+)\2/g, (full, prefix, q: string, rest: string) => {
    const r = toRelative(rest)
    return r === null ? full : `${prefix}${q}${r}${q}`
  })

  out = out.replace(/\bimport\s+(["'])@\/([^"']+)\1(?=\s*;)/g, (full, q: string, rest: string) => {
    const r = toRelative(rest)
    return r === null ? full : `import ${q}${r}${q}`
  })

  return out
}

/**
 * Normalize root-style (`/…`) and `@/…` specifiers across all preview sources.
 */
export function rewriteAllLeadingSlashImports(sources: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [vp, code] of Object.entries(sources)) {
    let c = rewriteLeadingSlashModuleSpecifiers(vp, code)
    c = rewriteAtAliasModuleSpecifiers(vp, c)
    out[vp] = c
  }
  return out
}
