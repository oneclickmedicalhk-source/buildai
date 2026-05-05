import type { SandpackFiles } from "@codesandbox/sandpack-react"

/** Paths the model must never override (CRA `react-ts` + Tailwind bootstrap). */
export const SANDBOX_PROTECTED_PATHS = new Set<string>([
  "/public/index.html",
  "/index.tsx",
  "/package.json",
  "tsconfig.json",
  "/tsconfig.json",
])

/**
 * CRA `react-ts` uses `/public/index.html` (webpack injects the bundle).
 * Tailwind Play CDN default: `cdn.tailwindcss.com`. Override with
 * `NEXT_PUBLIC_SANDPACK_TAILWIND_CDN_URL` if your network blocks the default.
 *
 * **Do not use `vite-react-ts` here:** it relies on CodeSandbox cloud shells (`Failed to get shell`).
 */
function tailwindPlayScriptSrc(): string {
  const fromEnv =
    typeof process !== "undefined"
      ? process.env.NEXT_PUBLIC_SANDPACK_TAILWIND_CDN_URL?.trim()
      : undefined
  const raw = fromEnv || "https://cdn.tailwindcss.com"
  return raw.replace(/"/g, "")
}

function buildTailwindPublicIndexHtml(): string {
  const src = tailwindPlayScriptSrc()
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Preview</title>
    <script src="${src}"></script>
  </head>
  <body class="min-h-screen bg-zinc-950 text-zinc-50 antialiased">
    <div id="root"></div>
  </body>
</html>`
}

/**
 * Merges AI-generated TSX with fixed Tailwind bootstrap for Sandpack `react-ts`.
 * CRA reads `REACT_APP_*` from `/.env` in the bundler.
 */
export function buildSandpackFiles(params: {
  appTsx: string
  extraFiles?: Record<string, string>
  dotEnv?: string | null
}): SandpackFiles {
  const files: SandpackFiles = {
    "/public/index.html": buildTailwindPublicIndexHtml(),
    "/styles.css": "body { margin: 0; }\n",
    "/App.tsx": params.appTsx,
  }
  if (params.extraFiles) {
    for (const [rawPath, code] of Object.entries(params.extraFiles)) {
      const path = rawPath.startsWith("/") ? rawPath : `/${rawPath}`
      if (SANDBOX_PROTECTED_PATHS.has(path)) continue
      files[path] = code
    }
  }
  if (params.dotEnv?.trim()) {
    files["/.env"] = params.dotEnv.trim() + "\n"
  }
  return files
}

export function filterModelFiles(files: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [rawPath, code] of Object.entries(files)) {
    const path = rawPath.startsWith("/") ? rawPath : `/${rawPath}`
    if (SANDBOX_PROTECTED_PATHS.has(path)) continue
    out[path] = code
  }
  return out
}

export function splitModelFiles(files: Record<string, string>): {
  appTsx: string
  extraFiles: Record<string, string>
} {
  const filtered = filterModelFiles(files)
  const app = filtered["/App.tsx"]
  const extra: Record<string, string> = { ...filtered }
  delete extra["/App.tsx"]
  return {
    appTsx: app ?? defaultPlaceholderApp(),
    extraFiles: extra,
  }
}

export function defaultPlaceholderApp(): string {
  return `export default function App(): JSX.Element {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8 bg-zinc-950 text-zinc-100">
      <p className="text-lg text-emerald-400 font-medium mb-2">BuildAI</p>
      <h1 className="text-2xl font-semibold text-center text-balance">Describe what you want in the chat</h1>
      <p className="mt-3 text-zinc-400 text-center max-w-md text-sm text-balance">
        Your preview runs here with Tailwind CSS in a safe sandbox.
      </p>
    </div>
  )
}
`
}

export function buildDotEnvFromSupabase(
  url: string | undefined,
  anonKey: string | undefined,
): string | null {
  if (!url?.trim() || !anonKey?.trim()) return null
  return `REACT_APP_SUPABASE_URL=${url.trim()}\nREACT_APP_SUPABASE_ANON_KEY=${anonKey.trim()}\n`
}
