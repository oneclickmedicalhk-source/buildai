/**
 * Smoke tests for `buildPreviewBundle` (esbuild + Tailwind pipeline).
 * Run from repo root: `npm run test:smoke`
 */
import { buildPreviewBundle } from "../lib/preview-bundle-server"

type Case = { name: string; files: Record<string, string> }

const baseApp = `import React from "react"
export default function App() {
  return (
    <main className="min-h-screen bg-zinc-950 p-6 text-emerald-400">
      <h1 className="text-xl font-semibold">Smoke</h1>
    </main>
  )
}
`

const cases: Case[] = [
  {
    name: "minimal App.tsx",
    files: { "/App.tsx": baseApp },
  },
  {
    name: "CRLF in App.tsx",
    files: { "/App.tsx": baseApp.replace(/\n/g, "\r\n") },
  },
  {
    name: "long single-line JSX (no artificial wrap errors)",
    files: {
      "/App.tsx": `import React from "react"
export default function App() {
  const t = "${"x".repeat(400)}"
  return <p className="p-4 text-xs break-all text-zinc-300">{t}</p>
}
`,
    },
  },
  {
    name: "JSX text <= may be auto-fixed to bundle",
    files: {
      "/App.tsx": `import React, { useState } from "react"
export default function App() {
  const [n] = useState(2)
  return (
    <main className="p-6 text-zinc-100">
      <p>Compare in text (should not break bundle): n <= 5</p>
      <p>Braced is fine: {n <= 5 ? "yes" : "no"}</p>
    </main>
  )
}
`,
    },
  },
  {
    name: "stray n after JSX close (broken newline artifact)",
    files: {
      "/App.tsx": `import React from "react"
export default function App() {
  return (
    <div className="p-4">
      <section>
        <p>hi</p>
      </section>n
      <section>
        <p>two</p>
      </section>
    </div>
  )
}
`,
    },
  },
  {
    name: "extraFiles import resolution",
    files: {
      "/App.tsx": `import React from "react"
import { Badge } from "./components/Badge"
export default function App() {
  return (
    <main className="p-6">
      <Badge label="ok" />
    </main>
  )
}
`,
      "/components/Badge.tsx": `import React from "react"
export function Badge({ label }: { label: string }) {
  return <span className="rounded bg-emerald-500/20 px-2 py-1 text-emerald-300">{label}</span>
}
`,
    },
  },
]

async function main(): Promise<void> {
  let failed = 0
  for (const c of cases) {
    const r = await buildPreviewBundle(c.files)
    if ("error" in r) {
      console.error(`FAIL ${c.name}: ${r.error}`)
      failed++
    } else {
      if (!r.js?.length || !r.css?.length) {
        console.error(`FAIL ${c.name}: missing js or css output`)
        failed++
      } else {
        console.log(`ok  ${c.name}${r.patchedFiles ? " (patched)" : ""}`)
      }
    }
  }
  if (failed) {
    process.exitCode = 1
    console.error(`\n${failed} case(s) failed.`)
  } else {
    console.log("\nAll smoke cases passed.")
  }
}

main().catch((e) => {
  console.error(e)
  process.exitCode = 1
})
