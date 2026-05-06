import type { Metadata } from "next"
import Link from "next/link"
import { Header } from "@/components/header"
import { DiagnosticsPanel } from "./diagnostics-panel"

export const metadata: Metadata = {
  title: "Connectivity diagnostics",
  robots: { index: false, follow: false },
}

export default function DiagnosticsPage() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className="flex-1 max-w-2xl mx-auto px-4 py-10 w-full">
        <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold">Connectivity diagnostics</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Use this page to see whether the problem is DNS/Vercel vs your browser or network path.
            </p>
          </div>
          <Link href="/" className="text-sm text-muted-foreground hover:text-foreground underline">
            Back to Builder
          </Link>
        </div>
        <DiagnosticsPanel />
      </main>
    </div>
  )
}
