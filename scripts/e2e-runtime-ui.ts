import fs from "node:fs"
import { chromium, type Page } from "playwright"
import { createClient } from "@supabase/supabase-js"

type BranchMode = "first" | "last"

type RuntimeScenario = {
  id: string
  prompt: string
  branch: BranchMode
}

type RuntimeScenarioResult = {
  id: string
  branch: BranchMode
  previewUpdated: boolean
  runtimeState: "ready" | "warning" | "error" | "timeout"
  iframeHasContent: boolean
  errorMessage?: string
}

type EnvMap = Record<string, string>

/**
 * Create a predictable run label for output artifacts.
 * Input: none.
 * Output: compact timestamp id for json report and screenshots.
 * Side effects: none.
 */
function makeRunId(): string {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, "0")
  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    "-",
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
  ].join("")
}

/**
 * Parse .env.local file into key-value map.
 * Input: raw env text.
 * Output: dictionary used by auth bootstrap helpers.
 * Side effects: none.
 */
function parseEnv(text: string): EnvMap {
  const out: EnvMap = {}
  for (const raw of text.split("\n")) {
    const line = raw.trim()
    if (!line || line.startsWith("#") || !line.includes("=")) continue
    const i = line.indexOf("=")
    const key = line.slice(0, i).trim()
    let value = line.slice(i + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    out[key] = value
  }
  return out
}

/**
 * Create a valid signed-in Supabase session for browser tests.
 * Input: parsed env map.
 * Output: storage key and serialized session payload.
 * Side effects: creates one temporary user in Supabase auth.
 */
async function buildBrowserAuthSeed(env: EnvMap): Promise<{ storageKey: string; storageValue: string }> {
  const url = env.NEXT_PUBLIC_BUILDAI_SUPABASE_URL
  const anon = env.NEXT_PUBLIC_BUILDAI_SUPABASE_ANON_KEY
  const service = env.BUILDAI_SUPABASE_SERVICE_ROLE_KEY
  if (!url || !anon || !service) {
    throw new Error("Missing Supabase env keys for runtime UI auth bootstrap")
  }
  const host = new URL(url).hostname
  const projectRef = host.split(".")[0]
  const storageKey = `sb-${projectRef}-auth-token`

  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } })
  const client = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } })
  const email = `runtime.ui.${Date.now()}.${Math.random().toString(36).slice(2, 7)}@example.com`
  const password = `BuildAi!${Math.random().toString(36).slice(2, 10)}A1`
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  if (created.error) throw created.error
  const signed = await client.auth.signInWithPassword({ email, password })
  if (signed.error || !signed.data.session) {
    throw signed.error ?? new Error("Failed to build Supabase browser session")
  }
  return {
    storageKey,
    storageValue: JSON.stringify(signed.data.session),
  }
}

/**
 * Open builder home and ensure a fresh project context.
 * Input: page and base URL.
 * Output: resolves when composer is ready to accept prompt text.
 * Side effects: navigates browser and may click "New project".
 */
async function openFreshBuilder(page: Page, baseUrl: string): Promise<void> {
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" })
  const textarea = page.locator("textarea").first()
  if (await textarea.isVisible().catch(() => false)) return
  const newProject = page.getByRole("button", { name: /new project/i }).first()
  if (await newProject.isVisible().catch(() => false)) {
    await newProject.click({ timeout: 15_000 })
  }
  await textarea.waitFor({ state: "visible", timeout: 60_000 })
}

/**
 * Submit a generation request from chat composer.
 * Input: page and prompt text.
 * Output: resolves after click action is accepted by UI.
 * Side effects: triggers server planning/generation flow.
 */
async function submitPrompt(page: Page, prompt: string): Promise<void> {
  const textarea = page.locator("textarea").first()
  await textarea.fill(prompt)
  const submitButton = page
    .getByRole("button", { name: /continue|generate|apply|繼續|生成|套用/i })
    .last()
  await submitButton.click()
}

/**
 * Enable quick-build mode with retries to handle chat panel re-renders.
 * Input: page with builder loaded.
 * Output: resolves when switch is enabled and stable.
 * Side effects: toggles quick build switch in UI.
 */
async function enableQuickBuild(page: Page): Promise<void> {
  await page.waitForSelector("#quick-build, #quick-build-footer", { timeout: 20_000 })
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const enabled = await page.evaluate(() => {
      const nodes = [
        document.getElementById("quick-build-footer"),
        document.getElementById("quick-build"),
      ].filter((n): n is HTMLElement => Boolean(n))
      if (!nodes.length) return false
      const checked = nodes.some((n) => n.getAttribute("aria-checked") === "true")
      if (checked) return true
      nodes[0].click()
      return nodes.some((n) => n.getAttribute("aria-checked") === "true")
    })
    if (enabled) return
    await page.waitForTimeout(400)
  }
  throw new Error("Unable to enable quick build after retries")
}

/**
 * Wait for chat/preview pipeline to complete or fail visibly.
 * Input: page.
 * Output: runtime status and optional error message.
 * Side effects: none.
 */
async function waitForRuntimeOutcome(page: Page): Promise<{
  previewUpdated: boolean
  runtimeState: "ready" | "warning" | "error" | "timeout"
  errorMessage?: string
}> {
  const previewUpdatedBadge = page.getByText("Preview updated").last()
  const runtimeReady = page.getByText(/Preview ready\.|預覽已就緒。/).first()
  const runtimeWarn = page
    .getByText(/Recoverable runtime warning|可恢復的執行時警告/)
    .first()
  const runtimeErrorLine = page
    .getByText(/Runtime check timed out|Runtime error|執行時檢查失敗|執行時錯誤/)
    .first()

  const deadline = Date.now() + 240_000
  let previewUpdated = false
  while (Date.now() < deadline) {
    if (!previewUpdated && (await previewUpdatedBadge.isVisible().catch(() => false))) {
      previewUpdated = true
    }
    if (await runtimeReady.isVisible().catch(() => false)) {
      return { previewUpdated, runtimeState: "ready" }
    }
    if (await runtimeWarn.isVisible().catch(() => false)) {
      return { previewUpdated, runtimeState: "warning" }
    }
    if (await runtimeErrorLine.isVisible().catch(() => false)) {
      const msg = (await runtimeErrorLine.textContent())?.trim() || "Runtime error visible in preview panel"
      return { previewUpdated, runtimeState: "error", errorMessage: msg }
    }
    await page.waitForTimeout(1000)
  }
  return { previewUpdated, runtimeState: "timeout", errorMessage: "Timed out waiting for runtime state" }
}

/**
 * Validate iframe content to detect blank-screen regressions.
 * Input: page with preview iframe.
 * Output: true when iframe body has meaningful content.
 * Side effects: none.
 */
async function checkIframeHasContent(page: Page): Promise<boolean> {
  const iframe = page.locator("iframe").first()
  const exists = (await iframe.count()) > 0
  if (!exists) return false
  const frameHandle = await iframe.elementHandle()
  if (!frameHandle) return false
  const frame = await frameHandle.contentFrame()
  if (!frame) return false
  const text = await frame.locator("body").innerText().catch(() => "")
  return text.trim().length >= 20
}

/**
 * Execute one runtime scenario from user perspective.
 * Input: page, base URL, and scenario config.
 * Output: pass/fail details for preview usability and runtime stability.
 * Side effects: drives UI interactions and writes screenshot on failures.
 */
async function runScenario(page: Page, baseUrl: string, scenario: RuntimeScenario): Promise<RuntimeScenarioResult> {
  console.log(`\n[runtime:start] ${scenario.id} (${scenario.branch})`)
  await openFreshBuilder(page, baseUrl)
  await enableQuickBuild(page)
  const branchHint =
    scenario.branch === "first"
      ? "Target entry-level users and cost-effective defaults."
      : "Target premium/advanced users with richer controls."
  await submitPrompt(page, `${scenario.prompt}\n${branchHint}`)

  const outcome = await waitForRuntimeOutcome(page)
  const iframeHasContent = await checkIframeHasContent(page)
  const result: RuntimeScenarioResult = {
    id: scenario.id,
    branch: scenario.branch,
    previewUpdated: outcome.previewUpdated,
    runtimeState: outcome.runtimeState,
    iframeHasContent,
    ...(outcome.errorMessage ? { errorMessage: outcome.errorMessage } : {}),
  }
  console.log(
    `[runtime:done] ${scenario.id} state=${result.runtimeState} previewUpdated=${result.previewUpdated} iframeHasContent=${result.iframeHasContent}`,
  )
  return result
}

/**
 * Main entrypoint for runtime usability matrix.
 * Input: environment variable TEST_BASE_URL (optional).
 * Output: prints JSON report and exits non-zero on failures.
 * Side effects: launches browser and runs multiple UI sessions.
 */
async function main(): Promise<void> {
  const baseUrl = process.env.TEST_BASE_URL ?? "http://localhost:3000"
  const runId = makeRunId()
  const env = parseEnv(fs.readFileSync(".env.local", "utf8"))
  const authSeed = await buildBrowserAuthSeed(env)
  const scenarios: RuntimeScenario[] = [
    {
      id: "pokemon_shop_branchA",
      prompt:
        "Build a Pokemon card online shop with catalog, rarity filtering, card detail view, cart, and checkout call-to-action.",
      branch: "first",
    },
    {
      id: "pokemon_shop_branchB",
      prompt:
        "Build a Pokemon card online shop with catalog, rarity filtering, card detail view, cart, and checkout call-to-action.",
      branch: "last",
    },
    {
      id: "car_repair_branchA",
      prompt:
        "Build a car repair shop website with service list, booking form, mechanic profiles, trust badges, and contact CTA.",
      branch: "first",
    },
    {
      id: "car_repair_branchB",
      prompt:
        "Build a car repair shop website with service list, booking form, mechanic profiles, trust badges, and contact CTA.",
      branch: "last",
    },
    {
      id: "aroma_store",
      prompt:
        "Build an aroma wellness storefront with hero, product cards, benefits, testimonials, and FAQ sections in a natural light style.",
      branch: "first",
    },
    {
      id: "restaurant_booking",
      prompt:
        "Build a restaurant website with menu sections, reservation form, featured dishes, and event booking promotions.",
      branch: "last",
    },
  ]

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  await context.addInitScript(
    ({ key, value }) => {
      window.localStorage.setItem(key, value)
    },
    { key: authSeed.storageKey, value: authSeed.storageValue },
  )
  const page = await context.newPage()
  const results: RuntimeScenarioResult[] = []
  fs.mkdirSync("artifacts", { recursive: true })

  try {
    for (const scenario of scenarios) {
      const result = await runScenario(page, baseUrl, scenario)
      results.push(result)
      if (result.runtimeState === "error" || result.runtimeState === "timeout" || !result.iframeHasContent) {
        await page.screenshot({ path: `artifacts/runtime-fail-${runId}-${scenario.id}.png`, fullPage: true })
      }
    }
  } finally {
    await context.close()
    await browser.close()
  }

  const failures = results.filter(
    (r) => r.runtimeState === "error" || r.runtimeState === "timeout" || !r.iframeHasContent,
  )
  const report = {
    runId,
    baseUrl,
    total: results.length,
    passed: results.length - failures.length,
    failed: failures.length,
    allPassed: failures.length === 0,
    results,
  }
  console.log(JSON.stringify(report, null, 2))
  if (failures.length > 0) process.exit(1)
}

main().catch((error) => {
  console.error("E2E_RUNTIME_UI_FAILED", error instanceof Error ? error.message : String(error))
  process.exit(1)
})
