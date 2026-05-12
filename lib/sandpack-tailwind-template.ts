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
 * Lightweight shadcn-style primitives injected by default so model outputs can
 * use consistent component imports without rebuilding boilerplate every turn.
 *
 * Models may override any of these paths via extraFiles if needed.
 */
function buildDefaultUiPrimitiveFiles(): Record<string, string> {
  return {
    "/lib/utils.ts": `export function cn(...inputs: Array<string | false | null | undefined>): string {
  return inputs.filter(Boolean).join(" ")
}
`,
    "/components/ui/button.tsx": `import type { ButtonHTMLAttributes } from "react"
import { cn } from "../../lib/utils"

type ButtonVariant = "default" | "secondary" | "outline" | "ghost"
type ButtonSize = "default" | "sm" | "lg"

const variantClass: Record<ButtonVariant, string> = {
  default: "bg-zinc-900 text-zinc-50 hover:bg-zinc-800",
  secondary: "bg-zinc-100 text-zinc-900 hover:bg-zinc-200",
  outline: "border border-zinc-300 bg-white text-zinc-900 hover:bg-zinc-50",
  ghost: "text-zinc-900 hover:bg-zinc-100",
}

const sizeClass: Record<ButtonSize, string> = {
  default: "h-10 px-4 py-2",
  sm: "h-9 rounded-md px-3",
  lg: "h-11 rounded-md px-8",
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
}

export function Button({ className, variant = "default", size = "default", ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 disabled:pointer-events-none disabled:opacity-50",
        variantClass[variant],
        sizeClass[size],
        className,
      )}
      {...props}
    />
  )
}
`,
    "/components/ui/card.tsx": `import type { HTMLAttributes } from "react"
import { cn } from "../../lib/utils"

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-xl border border-zinc-200 bg-white shadow-sm", className)} {...props} />
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col space-y-1.5 p-6", className)} {...props} />
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("text-lg font-semibold leading-none tracking-tight", className)} {...props} />
}

export function CardDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-sm text-zinc-500", className)} {...props} />
}

export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-6 pt-0", className)} {...props} />
}

export function CardFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex items-center p-6 pt-0", className)} {...props} />
}
`,
    "/components/ui/badge.tsx": `import type { HTMLAttributes } from "react"
import { cn } from "../../lib/utils"

export function Badge({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-0.5 text-xs font-medium text-zinc-700",
        className,
      )}
      {...props}
    />
  )
}
`,
    "/components/ui/input.tsx": `import type { InputHTMLAttributes } from "react"
import { cn } from "../../lib/utils"

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "flex h-10 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm ring-offset-white file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-zinc-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  )
}
`,
    "/components/ui/textarea.tsx": `import type { TextareaHTMLAttributes } from "react"
import { cn } from "../../lib/utils"

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "flex min-h-24 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm placeholder:text-zinc-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  )
}
`,
  }
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
    ...buildDefaultUiPrimitiveFiles(),
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
