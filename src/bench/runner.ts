import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join, dirname } from 'path'
import { generateAddFeatureImplementation } from '../workflows/phases/implementationPhase'
import { benchmarkSnapshot } from './snapshot'
import { compositeScore, guardrailPassRate, guardrailPerFile, CORRECTNESS_WEIGHTS } from './scoring'
import { loadScenarios, defaultScenariosDir } from './loader'
import { loadReferences, defaultReferencesDir } from './references'
import { createModelGenerate } from './modelGenerate'
import { rubricAdherence } from './rubric'
import { runCommand } from '../adapters/runCommand'
import {
  BenchAxisScores,
  BenchGeneratedFile,
  BenchReferenceScore,
  BenchRunOptions,
  BenchScenario,
  BenchScenarioRun,
  BenchSummary,
  BenchSuiteSummary,
  ScenarioGuardrailFile,
} from './types'

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

/** Score a set of files on the non-live axes (adherence + guardrails). */
function scoreFilesOffline(
  files: BenchGeneratedFile[],
  options: BenchRunOptions
): { axes: BenchAxisScores; composite: number | null } {
  const guardrails = guardrailPassRate(files)
  let adherence: number | null = null
  if (files.length > 0) {
    adherence = options.rubric ? options.rubric(files) : rubricAdherence(files)
  }
  const axes = { correctness: null, adherence, guardrails }
  return { axes, composite: compositeScore(axes) }
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
      const executor = options.runCommand || runCommand
      if (options.install) {
        await executor('npm', ['install', '--no-audit', '--no-fund'], { cwd: temp.dir })
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
  const composite = compositeScore(axes)

  // M6: score the human reference for this scenario and compute relative-to-human.
  const referenceFiles = options.references?.[scenario.id]
  let reference: BenchScenarioRun['reference']
  if (referenceFiles && referenceFiles.length > 0) {
    const ref = scoreFilesOffline(referenceFiles, options)
    const relative = relativeToReference(axes, composite, ref.axes, ref.composite)
    reference = {
      files: referenceFiles.map(f => f.path),
      axes: ref.axes,
      composite: ref.composite,
      relative,
    }
  }

  return {
    id: scenario.id,
    title: scenario.title,
    suite: scenario.suite,
    scaffoldable: scenario.scaffoldable,
    generatedFiles: files.map(f => f.path),
    guardrail,
    axes,
    composite,
    ...(correctnessDetails.length > 0 ? { correctnessDetails } : {}),
    ...(reference ? { reference } : {}),
  }
}

/** generated / reference per axis; null when either side is N/A or reference is 0. */
function relativeToReference(
  generated: BenchAxisScores,
  generatedComposite: number | null,
  reference: BenchAxisScores,
  referenceComposite: number | null
): BenchReferenceScore['relative'] {
  const ratio = (g: number | null, r: number | null): number | null => {
    if (g === null || r === null || r === 0) return null
    return g / r
  }
  return {
    correctness: ratio(generated.correctness, reference.correctness),
    adherence: ratio(generated.adherence, reference.adherence),
    guardrails: ratio(generated.guardrails, reference.guardrails),
    composite: ratio(generatedComposite, referenceComposite),
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
  const allReferenceComposites = runs
    .map(r => r.reference?.composite)
    .filter((c): c is number => c !== null && c !== undefined)
  const allRelativeComposites = runs
    .map(r => r.reference?.relative.composite)
    .filter((c): c is number => c !== null && c !== undefined)

  const average = (values: number[]): number | null =>
    values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : null

  return {
    specVersion: scenarios[0]?.specVersion ?? 0,
    runs,
    suites,
    overallComposite: average(allComposites),
    overallGuardrails: average(allGuardrails),
    overallReferenceComposite: average(allReferenceComposites),
    overallRelativeComposite: average(allRelativeComposites),
  }
}

/**
 * Convenience: load + run in one call.
 *
 * - The deterministic baseline (no `generate` seam and no `modelRouter`) scores
 *   only the scaffold-able subset (rn-01/02/05/06).
 * - Passing `modelRouter` (M5) builds a ModelRouter-backed generate seam so all
 *   10 scenarios run through the real model (the leaderboard pass).
 * - Human references (M6) are loaded from `referencesDir` (default
 *   bench/references) and scored relative-to-human per run.
 */
export async function runBenchmarkFromDir(
  options: BenchRunOptions & { scenariosDir?: string }
): Promise<{ summary: BenchSummary; problems: Array<{ file: string; problems: string[] }>; referenceProblems: Array<{ file: string; problems: string[] }> }> {
  const loaded = loadScenarios(options.scenariosDir || defaultScenariosDir())
  const emptySummary = (): BenchSummary => ({
    specVersion: 0,
    runs: [],
    suites: [],
    overallComposite: null,
    overallGuardrails: null,
    overallReferenceComposite: null,
    overallRelativeComposite: null,
  })
  if (loaded.scenarios.length === 0) {
    return { summary: emptySummary(), problems: loaded.problems, referenceProblems: [] }
  }

  const refLoaded = loadReferences(options.referencesDir || defaultReferencesDir())
  const references: Record<string, BenchGeneratedFile[]> = {}
  for (const [id, files] of refLoaded.references.entries()) {
    references[id] = files
  }

  const filter = options.filter ? { ...options.filter } : {}
  const hasGenerateSeam = Boolean(options.generate) || Boolean(options.modelRouter)
  if (!hasGenerateSeam && filter.scaffoldable === undefined) {
    filter.scaffoldable = true
  }
  const generate = options.generate || (options.modelRouter ? createModelGenerate({ modelRouter: options.modelRouter }) : undefined)
  const summary = await runBenchmark(loaded.scenarios, { ...options, filter, generate, references })
  return { summary, problems: loaded.problems, referenceProblems: refLoaded.problems }
}

export type { BenchGeneratedFile, ScenarioGuardrailFile }
