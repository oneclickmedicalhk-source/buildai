/**
 * Server-side preview bundle: esbuild + Tailwind v4 (PostCSS).
 * Avoids CodeSandbox bundler and external Tailwind CDN (blocked on many HK / office networks).
 */
import fs from "fs/promises"
import fsSync from "fs"
import os from "os"
import path from "path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { createRequire } from "node:module"
import * as esbuild from "esbuild"
import postcss from "postcss"
import {
  buildPreviewSourcesMap,
  describeMissingRelativeImports,
  isCodegenDiskPath,
} from "@/lib/preview-codegen-paths"
import { rewriteAllLeadingSlashImports } from "@/lib/preview-rewrite-imports"
import {
  applyEsbuildJsxCompareFixes,
  applyEsbuildStrayAfterCloseTagFixes,
} from "@/lib/fix-jsx-text-comparisons"

function findNearestPackageRoot(startDir: string): string | null {
  let cur = path.resolve(startDir)
  for (let i = 0; i < 20; i++) {
    if (fsSync.existsSync(path.join(cur, "package.json"))) return cur
    const up = path.dirname(cur)
    if (up === cur) break
    cur = up
  }
  return null
}

function resolveProjectRoot(): string {
  const fromCwd = findNearestPackageRoot(process.cwd())
  if (fromCwd) return fromCwd
  const fromModule = findNearestPackageRoot(path.dirname(fileURLToPath(import.meta.url)))
  if (fromModule) return fromModule
  return process.cwd()
}

function resolveNodeModulesRoot(projectRoot: string): string | null {
  try {
    const require = createRequire(path.join(projectRoot, "package.json"))
    const reactPkg = require.resolve("react/package.json")
    // .../node_modules/react/package.json -> .../node_modules
    return path.dirname(path.dirname(reactPkg))
  } catch {
    return null
  }
}

/** `createRequire` must anchor to a real file — `node_modules/package.json` usually does not exist. */
function createRequireForProjectPackages(projectRoot: string): ReturnType<typeof createRequire> {
  const rootPkg = path.join(projectRoot, "package.json")
  if (fsSync.existsSync(rootPkg)) {
    return createRequire(rootPkg)
  }
  return createRequire(import.meta.url)
}

/**
 * In some serverless runtimes, esbuild cannot resolve bare "react/jsx-runtime" from a temp
 * working directory. Resolve react's entry files to absolute paths under node_modulesRoot.
 */
function createReactAbsoluteResolvePlugin(_nodeModulesRoot: string): esbuild.Plugin {
  const projectRoot = resolveProjectRoot()
  const reqProject = createRequireForProjectPackages(projectRoot)
  const reqMeta = createRequire(import.meta.url)

  function resolveBare(id: string): string | null {
    try {
      return reqProject.resolve(id)
    } catch {
      try {
        return reqMeta.resolve(id)
      } catch {
        return null
      }
    }
  }

  const reactMain = resolveBare("react")
  const jsxRuntime = resolveBare("react/jsx-runtime")
  const reactDomMain = resolveBare("react-dom")
  const reactDomClient = resolveBare("react-dom/client")

  if (!jsxRuntime || !reactDomClient) {
    console.warn(
      "[preview-bundle] React path resolution incomplete",
      { jsxRuntime: Boolean(jsxRuntime), reactDomClient: Boolean(reactDomClient), cwd: process.cwd() },
    )
  }

  return {
    name: "react-absolute-resolve",
    setup(build) {
      build.onResolve({ filter: /^react$/ }, () =>
        reactMain ? { path: reactMain } : undefined,
      )
      build.onResolve({ filter: /^react\/jsx-runtime$/ }, () =>
        jsxRuntime ? { path: jsxRuntime } : undefined,
      )
      build.onResolve({ filter: /^react-dom$/ }, () =>
        reactDomMain ? { path: reactDomMain } : undefined,
      )
      build.onResolve({ filter: /^react-dom\/client$/ }, () =>
        reactDomClient ? { path: reactDomClient } : undefined,
      )
    },
  }
}

function toDiskPath(tmpDir: string, virtualPath: string): string {
  const rel = virtualPath.replace(/^\//, "")
  return path.join(tmpDir, rel)
}

/** Writes codegen paths (tsx/ts/jsx/js) under tmpDir from virtual `/…` keys. */
async function writeCodegenSourcesToTmp(
  tmpDir: string,
  sources: Record<string, string>,
): Promise<void> {
  const entries = Object.entries(sources).filter(([k]) => isCodegenDiskPath(k))
  for (const [virtualPath, code] of entries) {
    const disk = toDiskPath(tmpDir, virtualPath)
    await fs.mkdir(path.dirname(disk), { recursive: true })
    await fs.writeFile(disk, code, "utf8")
  }
}

function getEsbuildFailureErrors(e: unknown): esbuild.Message[] {
  if (!e || typeof e !== "object") return []
  const errs = (e as { errors?: esbuild.Message[] }).errors
  return Array.isArray(errs) ? errs : []
}

function formatEsbuildFailureMessage(e: unknown): string {
  const errs = getEsbuildFailureErrors(e)
  if (errs.length) {
    return errs
      .map((x) => {
        const loc = x.location
        const where =
          loc && loc.file
            ? ` ${path.basename(loc.file)}:${loc.line}:${loc.column}`
            : ""
        return `${x.text ?? "Error"}${where}`
      })
      .join("\n")
  }
  return e instanceof Error ? e.message : String(e)
}

export type PreviewBundleOk = {
  js: string
  css: string
  /** Present when server auto-fixed TSX (e.g. JSX text `<=` → `≤`) so the client can sync. */
  patchedFiles?: Record<string, string>
}

/**
 * Writes sources to a temp dir, builds Tailwind CSS scanning those files, then esbuild JS.
 */
export async function buildPreviewBundle(
  files: Record<string, string>,
): Promise<PreviewBundleOk | { error: string }> {
  const tmpDir = fsSync.mkdtempSync(path.join(os.tmpdir(), "buildai-preview-"))

  try {
    let sources = buildPreviewSourcesMap(files)
    sources = rewriteAllLeadingSlashImports(sources)
    if (!sources["/App.tsx"]) {
      return { error: "Missing /App.tsx in preview files." }
    }

    const missing = describeMissingRelativeImports(sources)
    if (missing) {
      return {
        error: `Generated code imports local files that are missing (or use wrong paths in extraFiles):\n${missing}\n\nUse Regenerate (↻) or ask for a single-file App in one /App.tsx.`,
      }
    }

    /** CRLF / lone CR breaks esbuild column vs our split("\\n") indexing — normalize before bundle + auto-fix. */
    for (const [k, v] of Object.entries(sources)) {
      if (!isCodegenDiskPath(k) || typeof v !== "string" || !v.includes("\r")) continue
      sources[k] = v.replace(/\r\n/g, "\n").replace(/\r/g, "\n")
    }

    const baselineSources = { ...sources }

    await writeCodegenSourcesToTmp(tmpDir, sources)

    const tmpPosix = tmpDir.replace(/\\/g, "/")
    const previewCssPath = path.join(tmpDir, "preview.css")
    // PostCSS resolves bare "tailwindcss" from the temp dir (no node_modules there).
    // Point at the project install explicitly.
    const projectRoot = resolveProjectRoot()
    const tailwindIndex = path.join(projectRoot, "node_modules", "tailwindcss", "index.css")
    const tailwindImportUrl = pathToFileURL(tailwindIndex).href
    const cssInput =
      `@import "${tailwindImportUrl}";\n` +
      `@source "${tmpPosix}/**/*.{tsx,ts,jsx,js}";\n`

    await fs.writeFile(previewCssPath, cssInput, "utf8")

    const tailwindPlugin = (await import("@tailwindcss/postcss")).default
    const processed = await postcss([tailwindPlugin]).process(cssInput, {
      from: previewCssPath,
    })
    const css = processed.css

    const entryPath = path.join(tmpDir, "__preview_entry__.tsx")
    const entrySource = `
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";

const el = document.getElementById("root");
if (el) {
  createRoot(el).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}
`
    await fs.writeFile(entryPath, entrySource, "utf8")

    const stripCssImports: esbuild.Plugin = {
      name: "strip-css-imports",
      setup(build) {
        build.onResolve({ filter: /\.css$/ }, () => ({
          path: "virtual-css-stub",
          namespace: "css-stub",
        }))
        build.onLoad({ filter: /.*/, namespace: "css-stub" }, () => ({
          contents: "",
          loader: "js",
        }))
      },
    }

    // In serverless (e.g. Vercel), process.cwd() may not contain node_modules at runtime.
    // Use require.resolve to find the real install path.
    const resolvedNodeModules = resolveNodeModulesRoot(projectRoot)
    const fallbackNodeModules = path.join(projectRoot, "node_modules")
    const nodeModulesRoot = resolvedNodeModules ?? fallbackNodeModules
    const reactAbsPlugin = createReactAbsoluteResolvePlugin(nodeModulesRoot)

    let lastFailure: unknown
    for (let attempt = 0; attempt < 3; attempt++) {
      await writeCodegenSourcesToTmp(tmpDir, sources)
      try {
        const result = await esbuild.build({
          // IMPORTANT:
          // Use the project working dir for package resolution so imports like "react/jsx-runtime"
          // can be resolved from the deployed function's dependencies.
          // If we keep absWorkingDir as the tmp dir, esbuild walks up from /tmp and will never
          // find node_modules in serverless environments.
          absWorkingDir: projectRoot,
          entryPoints: [entryPath],
          bundle: true,
          write: false,
          format: "iife",
          platform: "browser",
          jsx: "automatic",
          target: ["es2020"],
          // Models sometimes put JSX in `.ts`; parse as TSX for preview resilience.
          loader: {
            ".ts": "tsx",
          },
          define: {
            "process.env.NODE_ENV": JSON.stringify("production"),
          },
          logLevel: "silent",
          treeShaking: true,
          mainFields: ["module", "browser", "main"],
          nodePaths: [nodeModulesRoot, fallbackNodeModules],
          plugins: [stripCssImports, reactAbsPlugin],
        })

        const outs = result.outputFiles ?? []
        const jsFile =
          outs.find((f) => f.path.endsWith(".js")) ??
          outs.find((f) => f.path === "<stdout>") ??
          outs[0]
        if (!jsFile?.text) {
          const paths = outs.map((f) => f.path).join(", ") || "(none)"
          return { error: `esbuild produced no JS output (output paths: ${paths}).` }
        }

        const patchedFiles: Record<string, string> = {}
        for (const [k, v] of Object.entries(sources)) {
          if (baselineSources[k] !== v) patchedFiles[k] = v
        }
        const js = jsFile.text
        if (Object.keys(patchedFiles).length > 0) {
          return { js, css, patchedFiles }
        }
        return { js, css }
      } catch (e) {
        lastFailure = e
        const errors = getEsbuildFailureErrors(e)
        const afterCompare = applyEsbuildJsxCompareFixes(sources, tmpDir, errors)
        const base = afterCompare ?? sources
        const afterStray = applyEsbuildStrayAfterCloseTagFixes(base, tmpDir, errors)
        const next = afterStray ?? afterCompare
        if (!next || attempt >= 2) break
        sources = next
      }
    }

    let msg = formatEsbuildFailureMessage(lastFailure)
    if (!msg) msg = "Bundle failed"
    const finalErrs = getEsbuildFailureErrors(lastFailure)
    const head = finalErrs[0]
    if (head?.location?.file && head.text) {
      const loc = head.location
      console.warn(
        "[preview-bundle] esbuild (final):",
        head.text,
        `${path.basename(loc.file)}:${loc.line}:${loc.column}`,
      )
    }
    if (
      msg.includes('Expected ">" but found "="') ||
      msg.includes("Expected '>' but found '='") ||
      (msg.includes("found") && msg.includes("=") && msg.includes("Expected"))
    ) {
      msg += `\n\nTip: In JSX, never put <= or >= in plain text between tags — wrap comparisons in braces (e.g. {hp <= max}) or rephrase ("at most"). The preview server retries auto-fix (Unicode ≤ / ≥) when it recognizes the error; if you still see this, edit the line in the Code tab or Regenerate (↻).`
    }
    if (/found\s+["'][nt]["']/i.test(msg)) {
      msg += `\n\nTip: A bare "n" or "t" immediately after </…> or /> is often a broken \\n / \\t from the model — the server tries to strip it; if this persists, edit that spot in the Code tab or Regenerate (↻).`
    }
    return { error: msg }
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined)
  }
}
