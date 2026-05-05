"use client"

import Link from "next/link"
import { Header } from "@/components/header"
import { Button } from "@/components/ui/button"
import { useI18n } from "@/components/i18n-context"

export default function DocsPage() {
  const { lang } = useI18n()
  if (lang === "zh-HK") {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Header />
        <main className="flex-1 max-w-3xl mx-auto px-4 py-10 space-y-8">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight mb-2">文件</h1>
            <p className="text-muted-foreground">
              BuildAI 會生成 React + TypeScript + Tailwind UI，並由伺服器即時預覽（唔需要 Tailwind CDN）。
              你可以先用對話出計劃，確認後再生成；或者用「快速生成」跳過計劃。
            </p>
          </div>

          <section className="space-y-3">
            <h2 className="text-xl font-medium">呢頁用嚟做咩？</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              <strong className="text-foreground font-medium">文件</strong> 主要放環境設定、模型設定、整合（例如 Supabase）、
              匯出/下載行為同限制。產品/行銷資訊放喺{" "}
              <Link href="/pricing" className="text-accent underline underline-offset-4">
                收費
              </Link>
              ；實際使用就去{" "}
              <Link href="/" className="text-accent underline underline-offset-4">
                建立器
              </Link>
              。
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-medium">AI 模型（Header：模型）</h2>
            <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-2">
              <li>
                <strong className="text-foreground">Auto (env)</strong> — 跟伺服器規則：先睇{" "}
                <code className="text-xs bg-muted px-1 rounded">AI_PROVIDER</code>，再睇現有 keys。一般情況下如已設定 Gemini/Vertex
                會優先用 Gemini；否則用 OpenAI（需要{" "}
                <code className="text-xs bg-muted px-1 rounded">OPENAI_API_KEY</code>）。
              </li>
              <li>
                <strong className="text-foreground">Gemini</strong> — 設{" "}
                <code className="text-xs bg-muted px-1 rounded">GOOGLE_API_KEY</code> /{" "}
                <code className="text-xs bg-muted px-1 rounded">GEMINI_API_KEY</code> 或 Vertex service account /{" "}
                <code className="text-xs bg-muted px-1 rounded">GOOGLE_APPLICATION_CREDENTIALS</code>。
              </li>
              <li>
                <strong className="text-foreground">Claude (Vertex)</strong> — 需要 GCP OAuth 憑證（唔係 consumer API key）。
              </li>
              <li>
                <strong className="text-foreground">OpenAI</strong> — 設{" "}
                <code className="text-xs bg-muted px-1 rounded">OPENAI_API_KEY</code>。
              </li>
            </ul>
            <p className="text-sm text-muted-foreground">
              請將 <code className="text-xs bg-muted px-1 rounded">.env.example</code> 複製成{" "}
              <code className="text-xs bg-muted px-1 rounded">.env.local</code> 再填 key，改完要重啟{" "}
              <code className="text-xs bg-muted px-1 rounded">yarn dev</code>。
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-medium">UI pattern / Theme</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              你可以揀 <strong className="text-foreground">介面框架（UI pattern）</strong> 去固定 layout，再用{" "}
              <strong className="text-foreground">主題（Theme）</strong> 同{" "}
              <strong className="text-foreground">變體（Variant）</strong> 去做顏色/背景材質差異（例如 Pokemon neon 暗黑 vs 香薰自然淺色）。
            </p>
          </section>

          <Button asChild variant="outline" size="sm">
            <Link href="/">← 返回建立器</Link>
          </Button>
        </main>
      </div>
    )
  }
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className="flex-1 max-w-3xl mx-auto px-4 py-10 space-y-8">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight mb-2">Documentation</h1>
          <p className="text-muted-foreground">
            BuildAI generates React + TypeScript UIs with Tailwind, previewed on this server (no Tailwind CDN).
            Use the builder chat to plan, then confirm to generate code — or quick-build without a plan.
          </p>
        </div>

        <section className="space-y-3">
          <h2 className="text-xl font-medium">What this page is for</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            <strong className="text-foreground font-medium">Docs</strong> is the place for environment setup,
            model configuration, integrations (e.g. Supabase), export/download behaviour, and limits. Product
            marketing lives on <Link href="/pricing" className="text-accent underline underline-offset-4">
              Pricing
            </Link>
            ; the live product is the <Link href="/" className="text-accent underline underline-offset-4">
              Builder
            </Link>
            .
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-medium">AI models (header: Model)</h2>
          <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-2">
            <li>
              <strong className="text-foreground">Auto (env)</strong> — Uses server rules: checks{" "}
              <code className="text-xs bg-muted px-1 rounded">AI_PROVIDER</code>, then available keys. Typical
              order: Gemini (API key or Vertex) if configured, otherwise OpenAI if{" "}
              <code className="text-xs bg-muted px-1 rounded">OPENAI_API_KEY</code> is set. This matches what most
              teams run in production (fast iteration + regional Vertex options).
            </li>
            <li>
              <strong className="text-foreground">Gemini</strong> — Good for codegen and JSON; set{" "}
              <code className="text-xs bg-muted px-1 rounded">GOOGLE_API_KEY</code> /{" "}
              <code className="text-xs bg-muted px-1 rounded">GEMINI_API_KEY</code> or Vertex service account /
              <code className="text-xs bg-muted px-1 rounded"> GOOGLE_APPLICATION_CREDENTIALS</code>.
            </li>
            <li>
              <strong className="text-foreground">Claude (Vertex)</strong> — Strong reasoning; requires GCP auth
              (not-consumer API key alone). Set{" "}
              <code className="text-xs bg-muted px-1 rounded">AI_PROVIDER=vertex_claude</code> for server default
              or pick it in the UI.
            </li>
            <li>
              <strong className="text-foreground">OpenAI</strong> — Set{" "}
              <code className="text-xs bg-muted px-1 rounded">OPENAI_API_KEY</code>. Useful when Google APIs are
              region-restricted.
            </li>
          </ul>
          <p className="text-sm text-muted-foreground">
            Copy <code className="text-xs bg-muted px-1 rounded">.env.example</code> to{" "}
            <code className="text-xs bg-muted px-1 rounded">.env.local</code> and add your keys. Restart{" "}
            <code className="text-xs bg-muted px-1 rounded">yarn dev</code> after changes.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-medium">UI pattern (chat: UI pattern)</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Pick a preset so planning and codegen reuse the same shell:{" "}
            <strong className="text-foreground">Admin shell</strong> (sidebar + top bar) or{" "}
            <strong className="text-foreground">Storefront</strong> (shop nav + grid + cart), or{" "}
            <strong className="text-foreground">Storefront + admin</strong> (one app: storefront + role-gated admin
            CRUD), <strong className="text-foreground">SaaS marketing</strong> (landing sections), or{" "}
            <strong className="text-foreground">Dashboard analytics</strong> (KPI + filters + table). Default stays
            flexible if you do not need a fixed framework.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-medium">Preview & export</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Preview bundles via <code className="text-xs bg-muted px-1 rounded">POST /api/preview-bundle</code>{" "}
            (esbuild + Tailwind v4). Use <strong className="text-foreground">Download</strong> in the preview
            toolbar to export a ZIP of generated sources.
          </p>
        </section>

        <Button asChild variant="outline" size="sm">
          <Link href="/">← Back to Builder</Link>
        </Button>
      </main>
    </div>
  )
}
