import { applyUnifiedDiffToVirtualFiles } from "../lib/patch/apply-unified-diff"

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg)
}

async function main(): Promise<void> {
  const base = {
    "/App.tsx": ["export default function App() {", '  return <div className="p-4">Hello</div>', "}", ""].join("\n"),
  }

  const diff = [
    "--- /App.tsx",
    "+++ /App.tsx",
    "@@ -1,3 +1,3 @@",
    " export default function App() {",
    '-  return <div className="p-4">Hello</div>',
    '+  return <div className="p-4">Hello world</div>',
    " }",
    "",
  ].join("\n")

  const r = applyUnifiedDiffToVirtualFiles(base, diff)
  assert(r.patched["/App.tsx"]?.includes("Hello world"), "Expected patched App.tsx to include 'Hello world'")
  assert(r.changed.includes("/App.tsx"), "Expected changed files to include /App.tsx")

  console.log("ok  unified diff apply")
}

main().catch((e) => {
  console.error(e)
  process.exitCode = 1
})

