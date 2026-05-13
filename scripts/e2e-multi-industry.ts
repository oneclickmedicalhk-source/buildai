import fs from "node:fs"
import { createClient } from "@supabase/supabase-js"

type RoleMessage = { role: "user" | "assistant"; content: string }

type Clarification = { questionId: string; answer: string }

type OpenQuestion = {
  id: string
  question: string
  suggestedAnswers?: string[]
}

type Scenario = {
  id: string
  prompt: string
  branchAName: string
  branchBName: string
}

type BranchResult = {
  scenarioId: string
  branchName: string
  initialQuestionCount: number
  finalQuestionCount: number
  finalPlanSignature: string
  generateOk: boolean
  bundleOk: boolean
  failures: string[]
}

type ScenarioResult = {
  scenarioId: string
  prompt: string
  branchA: BranchResult
  branchB: BranchResult
  planDiverged: boolean
}

type MatrixReport = {
  baseUrl: string
  totalScenarios: number
  totalBranches: number
  passedBranches: number
  failedBranches: number
  allPassed: boolean
  results: ScenarioResult[]
}

/**
 * Parse .env.local and return key-value pairs.
 * Input: raw file text.
 * Output: environment dictionary for test credentials and host.
 * Side effect: none.
 */
function parseEnv(text: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const raw of text.split("\n")) {
    const line = raw.trim()
    if (!line || line.startsWith("#") || !line.includes("=")) continue
    const idx = line.indexOf("=")
    const key = line.slice(0, idx).trim()
    let value = line.slice(idx + 1).trim()
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
 * Run a promise with timeout guard.
 * Input: async promise, timeout ms, label.
 * Output: resolved promise value.
 * Side effect: throws timeout error when exceeded.
 */
async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | null = null
  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
  })
  try {
    return await Promise.race([promise, timeout])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/**
 * Build deterministic clarification answers for a branch.
 * Input: open questions and branch mode.
 * Output: clarification array sent back to /api/plan and /api/generate.
 * Side effect: none.
 */
function buildClarifications(
  openQuestions: OpenQuestion[],
  mode: "A" | "B",
  scenarioId: string,
): Clarification[] {
  return openQuestions.map((q, index) => {
    const picks = q.suggestedAnswers ?? []
    if (mode === "A") {
      return {
        questionId: q.id,
        answer: picks[0] ?? `Branch A default for ${scenarioId} Q${index + 1}`,
      }
    }
    return {
      questionId: q.id,
      answer:
        picks[picks.length - 1] ??
        `Branch B custom answer for ${scenarioId} Q${index + 1}: prioritize advanced users`,
    }
  })
}

/**
 * Create a stable plan signature for branch-difference checks.
 * Input: plan payload returned by planner.
 * Output: compact signature string used for divergence assertion.
 * Side effect: none.
 */
function makePlanSignature(plan: any): string {
  const summary = String(plan?.summary ?? "")
  const views = Array.isArray(plan?.informationArchitecture?.views)
    ? plan.informationArchitecture.views.map((v: any) => String(v?.id ?? "")).join("|")
    : ""
  const todos = Array.isArray(plan?.buildTodos) ? plan.buildTodos.map(String).join("|") : ""
  const assumptions = Array.isArray(plan?.assumptions) ? plan.assumptions.map(String).join("|") : ""
  return [summary, views, todos, assumptions].join("::")
}

/**
 * Create a temporary user and return bearer token.
 * Input: parsed environment config.
 * Output: JWT access token for protected API routes.
 * Side effect: creates auth user in Supabase.
 */
async function createAccessToken(env: Record<string, string>): Promise<string> {
  const url = env.NEXT_PUBLIC_BUILDAI_SUPABASE_URL
  const anon = env.NEXT_PUBLIC_BUILDAI_SUPABASE_ANON_KEY
  const service = env.BUILDAI_SUPABASE_SERVICE_ROLE_KEY
  if (!url || !anon || !service) {
    throw new Error("Missing Supabase env keys in .env.local")
  }

  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } })
  const client = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } })
  const email = `matrix.${Date.now()}.${Math.random().toString(36).slice(2, 7)}@example.com`
  const password = `BuildAi!${Math.random().toString(36).slice(2, 10)}A1`
  const created = await withTimeout(
    admin.auth.admin.createUser({ email, password, email_confirm: true }),
    30000,
    "createUser",
  )
  if (created.error) throw created.error

  const signed = await withTimeout(client.auth.signInWithPassword({ email, password }), 30000, "signInWithPassword")
  if (signed.error || !signed.data.session?.access_token) {
    throw signed.error ?? new Error("No access token returned")
  }
  return signed.data.session.access_token
}

/**
 * Execute one branch end-to-end: plan -> clarified plan -> generate -> preview bundle.
 * Input: scenario, branch mode, API base URL, and auth token.
 * Output: branch-level pass/fail metadata.
 * Side effect: performs API calls and consumes credits.
 */
async function runBranch(
  scenario: Scenario,
  mode: "A" | "B",
  baseUrl: string,
  token: string,
): Promise<BranchResult> {
  const failures: string[] = []
  const branchName = mode === "A" ? scenario.branchAName : scenario.branchBName
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` }
  const flags = {
    supabaseConfigured: false,
    uiLang: "en",
    aiProvider: "auto",
    uiStyleKit: "v0_hybrid",
    themeId: "auto",
    themeVariantId: "auto",
  }

  const planBody = {
    messages: [{ role: "user", content: scenario.prompt } satisfies RoleMessage],
    flags,
  }

  const initialPlanRes = await withTimeout(
    fetch(`${baseUrl}/api/plan`, {
      method: "POST",
      headers,
      body: JSON.stringify(planBody),
    }),
    120000,
    `${scenario.id}-${mode}-initial-plan`,
  )
  const initialPlanJson: any = await initialPlanRes.json()
  if (!initialPlanRes.ok || !initialPlanJson?.plan) {
    return {
      scenarioId: scenario.id,
      branchName,
      initialQuestionCount: 0,
      finalQuestionCount: 0,
      finalPlanSignature: "",
      generateOk: false,
      bundleOk: false,
      failures: [`initial plan failed: ${initialPlanJson?.error ?? initialPlanRes.status}`],
    }
  }

  const openQuestions: OpenQuestion[] = Array.isArray(initialPlanJson.plan?.openQuestions)
    ? initialPlanJson.plan.openQuestions
    : []
  if (openQuestions.length === 0) {
    failures.push("planner did not return clarification questions first")
  }
  const clarifications = buildClarifications(openQuestions, mode, scenario.id)

  const clarifiedPlanRes = await withTimeout(
    fetch(`${baseUrl}/api/plan`, {
      method: "POST",
      headers,
      body: JSON.stringify({ ...planBody, clarifications }),
    }),
    120000,
    `${scenario.id}-${mode}-clarified-plan`,
  )
  const clarifiedPlanJson: any = await clarifiedPlanRes.json()
  if (!clarifiedPlanRes.ok || !clarifiedPlanJson?.plan) {
    failures.push(`clarified plan failed: ${clarifiedPlanJson?.error ?? clarifiedPlanRes.status}`)
    return {
      scenarioId: scenario.id,
      branchName,
      initialQuestionCount: openQuestions.length,
      finalQuestionCount: 0,
      finalPlanSignature: "",
      generateOk: false,
      bundleOk: false,
      failures,
    }
  }

  const finalPlan = clarifiedPlanJson.plan
  const finalQuestionCount = Array.isArray(finalPlan?.openQuestions) ? finalPlan.openQuestions.length : 0

  let generateOk = false
  let bundleOk = false
  let currentAppTsx = ""
  let currentExtraFiles: Record<string, string> = {}
  const runGenerateOnce = async (userInstruction: string, timeoutMs: number) => {
    const res = await withTimeout(
      fetch(`${baseUrl}/api/generate`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          messages: [{ role: "user", content: userInstruction } satisfies RoleMessage],
          approvedPlan: finalPlan,
          clarifications,
          flags,
        }),
      }),
      timeoutMs,
      `${scenario.id}-${mode}-generate`,
    )
    const json: any = await res.json()
    return { res, json }
  }
  try {
    let { res: generateRes, json: generateJson } = await runGenerateOnce(`Build branch ${mode} now.`, 300000)
    if (!generateRes.ok && typeof generateJson?.error === "string" && /timed out|timeout/i.test(generateJson.error)) {
      ;({ res: generateRes, json: generateJson } = await runGenerateOnce(
        `Build branch ${mode} now. Keep implementation concise and deterministic.`,
        300000,
      ))
    }
    generateOk = Boolean(generateRes.ok && typeof generateJson?.appTsx === "string" && generateJson.appTsx.length > 0)
    if (!generateOk) {
      failures.push(`generate failed: ${generateJson?.error ?? generateRes.status}`)
    } else {
      currentAppTsx = generateJson.appTsx
      currentExtraFiles = generateJson.extraFiles ?? {}
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    if (/timed out/i.test(msg)) {
      try {
        const { res: retryRes, json: retryJson } = await runGenerateOnce(
          `Build branch ${mode} now. Keep implementation concise and deterministic.`,
          300000,
        )
        generateOk = Boolean(retryRes.ok && typeof retryJson?.appTsx === "string" && retryJson.appTsx.length > 0)
        if (!generateOk) failures.push(`generate retry failed: ${retryJson?.error ?? retryRes.status}`)
        else {
          currentAppTsx = retryJson.appTsx
          currentExtraFiles = retryJson.extraFiles ?? {}
        }
      } catch (retryError) {
        failures.push(retryError instanceof Error ? retryError.message : String(retryError))
      }
    } else {
      failures.push(msg)
    }
  }

  const tryBundle = async (appTsx: string, extraFiles: Record<string, string>): Promise<{ ok: boolean; error?: string }> => {
    const files = { "/App.tsx": appTsx, ...(extraFiles ?? {}) }
    const bundleRes = await withTimeout(
      fetch(`${baseUrl}/api/preview-bundle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ files }),
      }),
      60000,
      `${scenario.id}-${mode}-preview-bundle`,
    )
    const bundleJson: any = await bundleRes.json()
    if (bundleRes.ok) return { ok: true }
    return { ok: false, error: String(bundleJson?.error ?? bundleRes.status) }
  }

  if (generateOk) {
    try {
      let bundled = await tryBundle(currentAppTsx, currentExtraFiles)
      if (!bundled.ok) {
        // Emulate one UI-style repair turn before declaring failure.
        const repairRes = await withTimeout(
          fetch(`${baseUrl}/api/generate`, {
            method: "POST",
            headers,
            body: JSON.stringify({
              messages: [
                {
                  role: "user",
                  content:
                    "The generated code failed preview bundling. Fix bundling errors with minimal safe edits and keep existing features.",
                } satisfies RoleMessage,
              ],
              approvedPlan: finalPlan,
              clarifications,
              flags,
              refineFrom: { appTsx: currentAppTsx, extraFiles: currentExtraFiles },
              refineKind: "edit",
              editOutput: "full",
            }),
          }),
          180000,
          `${scenario.id}-${mode}-repair-generate`,
        )
        const repairJson: any = await repairRes.json()
        if (repairRes.ok && typeof repairJson?.appTsx === "string" && repairJson.appTsx.length > 0) {
          currentAppTsx = repairJson.appTsx
          currentExtraFiles = repairJson.extraFiles ?? {}
          bundled = await tryBundle(currentAppTsx, currentExtraFiles)
        }
      }
      bundleOk = bundled.ok
      if (!bundleOk) failures.push(`preview bundle failed: ${bundled.error ?? "unknown bundle failure"}`)
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error))
    }
  }

  return {
    scenarioId: scenario.id,
    branchName,
    initialQuestionCount: openQuestions.length,
    finalQuestionCount,
    finalPlanSignature: makePlanSignature(finalPlan),
    generateOk,
    bundleOk,
    failures,
  }
}

/**
 * Execute scenario matrix and collect reliability verdict.
 * Input: scenario list and API base URL.
 * Output: matrix report with branch and scenario outcomes.
 * Side effect: network calls to local API and auth service.
 */
async function runMatrix(scenarios: Scenario[], baseUrl: string): Promise<MatrixReport> {
  const env = parseEnv(fs.readFileSync(".env.local", "utf8"))
  const results: ScenarioResult[] = []
  const runBranchWithRetry = async (
    scenario: Scenario,
    mode: "A" | "B",
    token: string,
    fallback: BranchResult,
  ): Promise<BranchResult> => {
    let last: BranchResult = fallback
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const candidate = await runBranch(scenario, mode, baseUrl, token).catch((error) => ({
        ...fallback,
        failures: [error instanceof Error ? error.message : String(error)],
      }))
      if (candidate.failures.length === 0) return candidate
      last = candidate
      if (attempt < 2) {
        console.log(
          `[branch:retry] ${scenario.id} ${mode} attempt=${attempt + 1} reason=${candidate.failures[0] ?? "unknown"}`,
        )
      }
    }
    return last
  }

  for (const scenario of scenarios) {
    console.log(`\n[scenario:start] ${scenario.id}`)
    const tokenA = await createAccessToken(env)
    const tokenB = await createAccessToken(env)
    const branchAFallback: BranchResult = {
      scenarioId: scenario.id,
      branchName: scenario.branchAName,
      initialQuestionCount: 0,
      finalQuestionCount: 0,
      finalPlanSignature: "",
      generateOk: false,
      bundleOk: false,
      failures: ["branch A aborted unexpectedly"],
    }
    const branchBFallback: BranchResult = {
      scenarioId: scenario.id,
      branchName: scenario.branchBName,
      initialQuestionCount: 0,
      finalQuestionCount: 0,
      finalPlanSignature: "",
      generateOk: false,
      bundleOk: false,
      failures: ["branch B aborted unexpectedly"],
    }
    const branchA = await runBranchWithRetry(scenario, "A", tokenA, branchAFallback)
    console.log(
      `[branch:done] ${scenario.id} A failures=${branchA.failures.length} questions=${branchA.initialQuestionCount} bundleOk=${branchA.bundleOk}`,
    )
    const branchB = await runBranchWithRetry(scenario, "B", tokenB, branchBFallback)
    console.log(
      `[branch:done] ${scenario.id} B failures=${branchB.failures.length} questions=${branchB.initialQuestionCount} bundleOk=${branchB.bundleOk}`,
    )
    const planDiverged =
      branchA.finalPlanSignature.length > 0 &&
      branchB.finalPlanSignature.length > 0 &&
      branchA.finalPlanSignature !== branchB.finalPlanSignature
    if (!planDiverged) {
      branchA.failures.push("branch A/B produced identical final plan signature")
      branchB.failures.push("branch A/B produced identical final plan signature")
    }
    results.push({
      scenarioId: scenario.id,
      prompt: scenario.prompt,
      branchA,
      branchB,
      planDiverged,
    })
    console.log(`[scenario:done] ${scenario.id} planDiverged=${planDiverged}`)
  }

  const branches = results.flatMap((r) => [r.branchA, r.branchB])
  const passedBranches = branches.filter((b) => b.failures.length === 0).length
  const failedBranches = branches.length - passedBranches

  return {
    baseUrl,
    totalScenarios: scenarios.length,
    totalBranches: branches.length,
    passedBranches,
    failedBranches,
    allPassed: failedBranches === 0,
    results,
  }
}

async function main(): Promise<void> {
  const baseUrl = process.env.TEST_BASE_URL ?? "http://localhost:3000"
  const scenarios: Scenario[] = [
    {
      id: "pokemon_shop",
      prompt:
        "Build a Pokemon card online shop with homepage, card catalog, rarity filters, card detail, cart, and checkout call-to-action.",
      branchAName: "budget_beginner_collectors",
      branchBName: "premium_advanced_collectors",
    },
    {
      id: "car_repair_shop",
      prompt:
        "Build a car repairing shop website with services, pricing, mechanic profiles, booking form, and contact channels.",
      branchAName: "booking_first_service_packages",
      branchBName: "emergency_hotline_multilingual",
    },
    {
      id: "aroma_wellness_store",
      prompt:
        "Build an aroma wellness product storefront with hero, product categories, ingredients highlights, testimonials, and FAQ.",
      branchAName: "daily_affordable_bundle_focus",
      branchBName: "premium_spa_experience_focus",
    },
    {
      id: "restaurant_booking",
      prompt:
        "Build a restaurant website with menu sections, chef highlights, reservation form, and event booking promotions.",
      branchAName: "family_casual_dining",
      branchBName: "fine_dining_private_events",
    },
  ]

  const report = await runMatrix(scenarios, baseUrl)
  console.log(JSON.stringify(report, null, 2))
  if (!report.allPassed) process.exit(1)
}

main().catch((error) => {
  console.error("E2E_MULTI_INDUSTRY_FAILED", error instanceof Error ? error.message : String(error))
  process.exit(1)
})
