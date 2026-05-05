import { NextResponse } from "next/server"
import { buildPreviewBundle } from "@/lib/preview-bundle-server"

export const runtime = "nodejs"

const MAX_FILE_BYTES = 450_000
const MAX_FILES = 60

function validateFiles(files: Record<string, string>): string | null {
  const keys = Object.keys(files)
  if (keys.length > MAX_FILES) return `Too many files (max ${MAX_FILES}).`
  for (const [k, v] of Object.entries(files)) {
    if (Buffer.byteLength(v, "utf8") > MAX_FILE_BYTES) {
      return `File too large: ${k}`
    }
  }
  return null
}

/**
 * POST JSON body: `{ "files": SandpackFiles-like map path -> source }`.
 * Returns `{ js, css }` for an iframe srcDoc preview (no CodeSandbox / no Tailwind CDN).
 */
export async function POST(req: Request) {
  try {
    const raw: unknown = await req.json()
    if (!raw || typeof raw !== "object") {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }
    const filesUnknown = (raw as { files?: unknown }).files
    if (!filesUnknown || typeof filesUnknown !== "object") {
      return NextResponse.json({ error: "Missing files object" }, { status: 400 })
    }

    const files: Record<string, string> = {}
    for (const [k, v] of Object.entries(filesUnknown as Record<string, unknown>)) {
      if (typeof v !== "string") {
        return NextResponse.json({ error: `Invalid file value for ${k}` }, { status: 400 })
      }
      const key = k.startsWith("/") ? k : `/${k}`
      files[key] = v
    }
    const bad = validateFiles(files)
    if (bad) {
      return NextResponse.json({ error: bad }, { status: 400 })
    }

    const result = await buildPreviewBundle(files)
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 422 })
    }
    const body: { js: string; css: string; patchedFiles?: Record<string, string> } = {
      js: result.js,
      css: result.css,
    }
    if (result.patchedFiles && Object.keys(result.patchedFiles).length > 0) {
      body.patchedFiles = result.patchedFiles
    }
    return NextResponse.json(body)
  } catch (e) {
    const message = e instanceof Error ? e.message : "Bundle failed"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
