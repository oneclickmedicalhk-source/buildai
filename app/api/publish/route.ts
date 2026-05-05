import { NextResponse } from "next/server"
import { z } from "zod"
import { cookies } from "next/headers"
import { decryptJson } from "@/lib/secure-token"

type GitHubCookie = { accessToken: string }
type VercelCookie = { accessToken: string }

const publishRequestSchema = z.object({
  siteName: z.string().min(2).max(60),
  repoName: z.string().min(2).max(80),
  /** Model files from builder: /App.tsx + extra files (paths start with /). */
  modelFiles: z.record(z.string()),
  /** Optional Supabase integration to inject as env vars in Vercel project. */
  integrations: z
    .object({
      supabase: z
        .object({
          url: z.string().min(1),
          anonKey: z.string().min(1),
        })
        .nullable(),
    })
    .optional(),
})

export async function POST(req: Request) {
  try {
    const c = await cookies()
    const ghRaw = c.get("buildai_github")?.value
    const vcRaw = c.get("buildai_vercel")?.value
    if (!ghRaw || !vcRaw) {
      return NextResponse.json({ error: "Connect GitHub and Vercel first." }, { status: 401 })
    }
    const gh = decryptJson<GitHubCookie>(ghRaw)
    const vc = decryptJson<VercelCookie>(vcRaw)

    const body = publishRequestSchema.parse(await req.json())

    const owner = await githubViewerLogin(gh.accessToken)
    const repoFull = await githubCreateRepo({
      accessToken: gh.accessToken,
      repoName: body.repoName,
      description: `Published from BuildAI: ${body.siteName}`,
    })

    const fileMap = buildNextAppTemplate({
      modelFiles: body.modelFiles,
      title: body.siteName,
    })

    await githubCommitAllFiles({
      accessToken: gh.accessToken,
      owner,
      repo: body.repoName,
      branch: "main",
      files: fileMap,
    })

    const deployment = await vercelCreateDeployment({
      accessToken: vc.accessToken,
      name: body.siteName,
      files: fileMap,
      env: body.integrations?.supabase
        ? {
            NEXT_PUBLIC_SUPABASE_URL: body.integrations.supabase.url,
            NEXT_PUBLIC_SUPABASE_ANON_KEY: body.integrations.supabase.anonKey,
          }
        : undefined,
      gitSource: {
        type: "github",
        repo: `${owner}/${body.repoName}`,
      },
    })

    return NextResponse.json({
      url: `https://${deployment.url}`,
      repo: `https://github.com/${repoFull}`,
      deploymentId: deployment.id,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Publish failed"
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}

async function githubViewerLogin(accessToken: string): Promise<string> {
  const res = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "User-Agent": "BuildAI",
      Accept: "application/vnd.github+json",
    },
  })
  const data = (await res.json()) as { login?: string; message?: string }
  if (!res.ok || !data.login) throw new Error(data.message ?? "GitHub auth failed")
  return data.login
}

async function githubCreateRepo(params: {
  accessToken: string
  repoName: string
  description: string
}): Promise<string> {
  const res = await fetch("https://api.github.com/user/repos", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
      "User-Agent": "BuildAI",
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: params.repoName,
      description: params.description,
      private: false,
      auto_init: false,
    }),
  })
  const data = (await res.json()) as { full_name?: string; message?: string }
  if (!res.ok || !data.full_name) {
    // If repo already exists, treat as idempotent publish.
    if (data.message && data.message.toLowerCase().includes("name already exists")) {
      const owner = await githubViewerLogin(params.accessToken)
      return `${owner}/${params.repoName}`
    }
    throw new Error(data.message ?? "Failed to create GitHub repo")
  }
  return data.full_name
}

async function githubCommitAllFiles(params: {
  accessToken: string
  owner: string
  repo: string
  branch: string
  files: Record<string, string>
}) {
  // Create initial commit by PUTting contents (simple, good enough for small templates).
  for (const [path, content] of Object.entries(params.files)) {
    const apiPath = encodeGithubPath(path.replace(/^\//, ""))
    const res = await fetch(
      `https://api.github.com/repos/${params.owner}/${params.repo}/contents/${apiPath}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${params.accessToken}`,
          "User-Agent": "BuildAI",
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: `Add ${path}`,
          content: Buffer.from(content, "utf8").toString("base64"),
          branch: params.branch,
        }),
      },
    )
    const data = (await res.json()) as { message?: string }
    if (!res.ok) {
      throw new Error(data.message ?? `Failed to upload ${path}`)
    }
  }
}

function encodeGithubPath(p: string): string {
  return p
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/")
}

function buildNextAppTemplate(params: {
  modelFiles: Record<string, string>
  title: string
}): Record<string, string> {
  const appTsx = params.modelFiles["/App.tsx"] ?? params.modelFiles["App.tsx"]
  if (!appTsx?.trim()) throw new Error("Missing /App.tsx")

  const files: Record<string, string> = {}

  // Generated sources → src/* to preserve relative imports.
  files["src/App.tsx"] = appTsx
  for (const [rawPath, code] of Object.entries(params.modelFiles)) {
    const path = rawPath.startsWith("/") ? rawPath : `/${rawPath}`
    if (path === "/App.tsx") continue
    files[`src${path}`] = code
  }

  files["package.json"] = JSON.stringify(
    {
      name: slug(params.title),
      private: true,
      scripts: {
        dev: "next dev",
        build: "next build",
        start: "next start",
      },
      dependencies: {
        next: "latest",
        react: "latest",
        "react-dom": "latest",
      },
    },
    null,
    2,
  )

  files["tsconfig.json"] = JSON.stringify(
    {
      compilerOptions: {
        target: "ES2022",
        lib: ["dom", "dom.iterable", "esnext"],
        allowJs: false,
        skipLibCheck: true,
        strict: true,
        noEmit: true,
        esModuleInterop: true,
        module: "esnext",
        moduleResolution: "bundler",
        resolveJsonModule: true,
        isolatedModules: true,
        jsx: "preserve",
        incremental: true,
        plugins: [{ name: "next" }],
      },
      include: ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
      exclude: ["node_modules"],
    },
    null,
    2,
  )

  files["next-env.d.ts"] = `/// <reference types=\"next\" />\n/// <reference types=\"next/image-types/global\" />\n\n// NOTE: This file should not be edited\n`

  files["src/app/layout.tsx"] = `import \"./globals.css\"\n\nexport default function RootLayout({ children }: { children: React.ReactNode }) {\n  return (\n    <html lang=\"en\">\n      <body>{children}</body>\n    </html>\n  )\n}\n`

  files["src/app/page.tsx"] = `import App from \"../App\"\n\nexport default function Page(): JSX.Element {\n  return <App />\n}\n`

  files["src/app/globals.css"] = `@tailwind base;\n@tailwind components;\n@tailwind utilities;\n\n:root { color-scheme: dark; }\nhtml, body { height: 100%; }\n`

  files["postcss.config.js"] = `module.exports = { plugins: { tailwindcss: {}, autoprefixer: {} } }\n`
  files["tailwind.config.js"] =
    `/** @type {import('tailwindcss').Config} */\nmodule.exports = {\n  content: [\"./src/**/*.{js,ts,jsx,tsx}\"],\n  theme: { extend: {} },\n  plugins: [],\n}\n`

  return files
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 48) || "buildai-site"
}

async function vercelCreateDeployment(params: {
  accessToken: string
  name: string
  files: Record<string, string>
  env?: Record<string, string>
  gitSource?: { type: "github"; repo: string }
}): Promise<{ id: string; url: string }> {
  const files = Object.entries(params.files).map(([file, data]) => ({
    file,
    data,
  }))

  const res = await fetch("https://api.vercel.com/v13/deployments", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: slug(params.name),
      files,
      projectSettings: {
        framework: "nextjs",
      },
      ...(params.env
        ? {
            env: Object.fromEntries(
              Object.entries(params.env).map(([k, v]) => [
                k,
                { type: "encrypted", value: v },
              ]),
            ),
          }
        : {}),
      ...(params.gitSource ? { gitSource: { type: params.gitSource.type, repo: params.gitSource.repo } } : {}),
    }),
  })

  const data = (await res.json()) as { id?: string; url?: string; error?: { message?: string } }
  if (!res.ok || !data.id || !data.url) {
    throw new Error(data.error?.message ?? "Vercel deploy failed")
  }
  return { id: data.id, url: data.url }
}

