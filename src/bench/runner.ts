import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join, dirname } from 'path'
import { generateAddFeatureImplementation } from '../workflows/phases/implementationPhase'
import type { ContextSnapshot } from '../harness/types'
import { compositeScore, guardrailPassRate, guardrailPerFile, CORRECTNESS_WEIGHTS } from './scoring'
import { loadScenarios, defaultScenariosDir } from './loader'
import { rubricAdherence } from './rubric'
import { runCommand } from '../adapters/runCommand'
import {
  BenchGeneratedFile,
  BenchRunOptions,
  BenchScenario,
  BenchScenarioRun,
  BenchSummary,
  BenchSuiteSummary,
  ScenarioGuardrailFile,
} from './types'

/** Minimal TS-convention snapshot so the deterministic scaffold emits .ts/.tsx. */
function benchmarkSnapshot(): ContextSnapshot {
  return {
    project: {
      root: '',
      name: 'rn-bench-app',
      version: '1.0.0',
      reactNativeVersion: '0.74.0',
      dependencies: {},
      devDependencies: {},
      scripts: {},
      platforms: ['ios', 'android'],
      hasTypeScript: true,
      hasMetro: true,
      hasExpo: false,
    },
    structure: [],
    components: [],
    recentChanges: [],
    timestamp: Date.now(),
  }
}

/** Deterministic baseline: the same "add feature" scaffold the implementation
 * phase falls back to with no model. */
export function deterministicGenerate(scenario: BenchScenario): BenchGeneratedFile[] {
  const result = generateAddFeatureImplementation(undefined, {
    snapshot: benchmarkSnapshot(),
    prompt: scenario.prompt,
  })
  return result.artifacts
    .filter(a => typeof a.path === 'string' && a.path.length > 0 && typeof a.content === 'string')
    .map(a => ({ path: a.path as string, content: a.content }))
}

interface TempProject {
  dir: string
  cleanup: () => void
}

function createTempProject(fixtures: Record<string, string>): TempProject {
  const dir = mkdtempSync(join(tmpdir(), 'vectalon-bench-'))
  for (const [relPath, content] of Object.entries(fixtures)) {
    const fullPath = join(dir, relPath)
    mkdirSync(dirname(fullPath), { recursive: true })
    writeFileSync(fullPath, content)
  }
  return {
    dir,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  }
}

interface LiveCorrectnessResult {
  score: number | null
  details: string[]
}

async function runLiveCorrectness(
  scenario: BenchScenario,
  projectDir: string,
  options: BenchRunOptions
): Promise<LiveCorrectnessResult> {
  const executor = options.runCommand || runCommand
  const details: string[] = []
  const checks: Array<{ key: keyof typeof CORRECTNESS_WEIGHTS; label: string; args: string[] }> = [
    { key: 'tests', label: 'Tests', args: ['jest'] },
    { key: 'typecheck', label: 'Type check', args: ['tsc', '--noEmit'] },
    { key: 'lint', label: 'Lint', args: ['eslint', '.'] },
  ]

  let weighted = 0
  let weightSum = 0
  for (const check of checks) {
    if (!scenario.correctness[check.key]) continue
    const result = await executor('npx', check.args, { cwd: projectDir })
    const passed = result.success
    weighted += passed ? CORRECTNESS_WEIGHTS[check.key] : 0
    weightSum += CORRECTNESS_WEIGHTS[check.key]
    details.push(`- ${check.label}: ${passed ? 'passed' : `failed (exit ${result.exitCode})`}`)
  }

  // Optional runtime-smoke credit (capped): booting the app is beyond M1; skip
  // unless a custom runCommand proves a smoke check. Weight stays capped at 1.0.

  if (weightSum === 0) return { score: null, details }
  return { score: Math.min(1, weighted / weightSum), details }
}

export async function runScenario(scenario: BenchScenario, options: BenchRunOptions = {}): Promise<BenchScenarioRun> {
  const generate = options.generate || deterministicGenerate
  const files = await generate(scenario)

  const guardrail = guardrailPerFile(files)
  const guardrails = guardrailPassRate(files)

  let correctness: number | null = null
  let correctnessDetails: string[] = []
  if (options.live) {
    const temp = createTempProject(scenario.fixtures)
    try {
      for (const file of files) {
        const fullPath = join(temp.dir, file.path)
        mkdirSync(dirname(fullPath), { recursive: true })
        writeFileSync(fullPath, file.content)
      }
      const live = await runLiveCorrectness(scenario, temp.dir, options)
      correctness = live.score
      correctnessDetails = live.details
    } finally {
      temp.cleanup()
    }
  }

  let adherence: number | null = null
  if (files.length > 0) {
    adherence = options.rubric ? options.rubric(files) : rubricAdherence(files)
  }

  const axes = { correctness, adherence, guardrails }

  return {
    id: scenario.id,
    title: scenario.title,
    suite: scenario.suite,
    scaffoldable: scenario.scaffoldable,
    generatedFiles: files.map(f => f.path),
    guardrail,
    axes,
    composite: compositeScore(axes),
    ...(correctnessDetails.length > 0 ? { correctnessDetails } : {}),
  }
}

export function shouldRunScenario(scenario: BenchScenario, filter: BenchRunOptions['filter']): boolean {
  if (!filter) return true
  if (filter.suite && scenario.suite !== filter.suite) return false
  if (filter.scaffoldable !== undefined && scenario.scaffoldable !== filter.scaffoldable) return false
  if (filter.ids && !filter.ids.includes(scenario.id)) return false
  return true
}

export async function runBenchmark(scenarios: BenchScenario[], options: BenchRunOptions = {}): Promise<BenchSummary> {
  const runs: BenchScenarioRun[] = []
  for (const scenario of scenarios) {
    if (!shouldRunScenario(scenario, options.filter)) continue
    runs.push(await runScenario(scenario, options))
  }

  const bySuite = new Map<string, BenchScenarioRun[]>()
  for (const run of runs) {
    const list = bySuite.get(run.suite) || []
    list.push(run)
    bySuite.set(run.suite, list)
  }

  const suites: BenchSuiteSummary[] = []
  for (const [suite, suiteRuns] of bySuite.entries()) {
    const composites = suiteRuns.map(r => r.composite).filter((c): c is number => c !== null)
    const guardrails = suiteRuns.map(r => r.axes.guardrails).filter((g): g is number => g !== null)
    suites.push({
      suite,
      scenarioIds: suiteRuns.map(r => r.id),
      composite: composites.length > 0 ? composites.reduce((a, b) => a + b, 0) / composites.length : null,
      guardrails: guardrails.length > 0 ? guardrails.reduce((a, b) => a + b, 0) / guardrails.length : null,
    })
  }

  const allComposites = runs.map(r => r.composite).filter((c): c is number => c !== null)
  const allGuardrails = runs.map(r => r.axes.guardrails).filter((g): g is number => g !== null)

  return {
    specVersion: scenarios[0]?.specVersion ?? 0,
    runs,
    suites,
    overallComposite: allComposites.length > 0 ? allComposites.reduce((a, b) => a + b, 0) / allComposites.length : null,
    overallGuardrails: allGuardrails.length > 0 ? allGuardrails.reduce((a, b) => a + b, 0) / allGuardrails.length : null,
  }
}

/**
 * Convenience: load + run in one call.
 *
 * The deterministic baseline (no `generate` seam) scores only the scaffold-able
 * subset (rn-01/02/05/06); model-only scenarios require a real generate seam.
 * Callers can override via `filter.scaffoldable`.
 */
export async function runBenchmarkFromDir(options: BenchRunOptions & { scenariosDir?: string }): Promise<{ summary: BenchSummary; problems: Array<{ file: string; problems: string[] }> }> {
  const loaded = loadScenarios(options.scenariosDir || defaultScenariosDir())
  if (loaded.scenarios.length === 0) {
    return { summary: { specVersion: 0, runs: [], suites: [], overallComposite: null, overallGuardrails: null }, problems: loaded.problems }
  }
  const filter = options.filter ? { ...options.filter } : {}
  if (!options.generate && filter.scaffoldable === undefined) {
    filter.scaffoldable = true
  }
  const summary = await runBenchmark(loaded.scenarios, { ...options, filter })
  return { summary, problems: loaded.problems }
}

export type { BenchGeneratedFile, ScenarioGuardrailFile }
