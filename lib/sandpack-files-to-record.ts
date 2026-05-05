import type { SandpackFile, SandpackFiles } from "@codesandbox/sandpack-react"

/** Flatten Sandpack file map to path -> source for the preview bundle API. */
export function sandpackFilesToCodeRecord(files: SandpackFiles): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(files)) {
    const key = k.startsWith("/") ? k : `/${k}`
    const code = typeof v === "string" ? v : (v as SandpackFile).code
    out[key] = code
  }
  return out
}
