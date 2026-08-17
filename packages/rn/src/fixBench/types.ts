/**
 * vc fix-bench — the "make vc fix unbelievably reliable" benchmark (Roadmap
 * directive #2). One hundred real React Native failure scenarios — Gradle
 * conflicts, Kotlin/AGP mismatches, CocoaPods/Xcode breakages, Metro
 * resolution, Hermes crashes, RN upgrade breakages, native module linking,
 * TypeScript regressions — each materialized as a broken project and run
 * through the REAL `runFix` pipeline. Six axes are scored per scenario:
 * diagnosis accuracy, fix accuracy, build success, false-positive rate, time
 * saved, and human intervention. Business Source License 1.1 (BSL-1.1).
 */

export const FIX_BENCH_SPEC_VERSION = 1

/** The ten real-failure families the pack covers. */
export type FixBenchSuite =
  | 'gradle-conflict'
  | 'kotlin'
  | 'agp'
  | 'cocoapods'
  | 'xcode'
  | 'metro'
  | 'hermes'
  | 'upgrade'
  | 'linking'
  | 'typescript'

export interface FixBenchExpect {
  /** The root-cause finding id the pipeline must produce (e.g. 'duplicate-class'). */
  diagnosisId: string
  /** Fallback: every keyword must appear in the root finding's message/title. */
  diagnosisKeywords: string[]
  /** The file the fix must touch. */
  fixFile: string
  /** After applying the planned edits, this file must contain every string. */
  mustContain: string[]
  /** After applying the planned edits, this file must contain none of these. */
  mustNotContain: string[]
  /** Whether the deterministic planner is expected to auto-fix this root cause. */
  autoFixable: boolean
}

export interface FixBenchScenario {
  id: string
  specVersion: number
  suite: FixBenchSuite
  title: string
  /** The developer's natural-language issue (what `vc fix "<issue>"` gets). */
  issue: string
  /** A failing build log (Gradle/Xcode/Metro/tsc); optional — many failures
   * are diagnosed from the broken project state alone. */
  log?: string
  /** Broken files: materialized over the shared base to make the failing project. */
  broken: Record<string, string>
  /** Healthy (fixed) files: the same paths, in the state the fix must reach.
   * Used as the false-positive control (diagnosing healthy code must be quiet)
   * and as the fix target when the planner cannot auto-edit. */
  healthy: Record<string, string>
  expect: FixBenchExpect
}

/** Per-scenario scored run. */
export interface FixBenchScenarioRun {
  id: string
  suite: FixBenchSuite
  title: string
  /** True when the root finding matched the expected diagnosis. */
  diagnosis: boolean
  /** The finding id the pipeline produced (null = no finding). */
  diagnosisId: string | null
  /** True when applying the edits produced the expected file state. */
  fix: boolean
  /** True when the pipeline planned ≥1 edit (auto-fix path taken). */
  autoFixed: boolean
  /** True when the expected root cause no longer fires after the fix is
   * applied (the hermetic build-success proxy). */
  buildSuccess: boolean
  /** True when a healthy control run reported no error findings. */
  noFalsePositive: boolean
  /** Wall-clock ms for the diagnose+plan+sandbox apply pass. */
  ms: number
  verdict: string
  note?: string
}

export interface FixBenchSummary {
  specVersion: number
  total: number
  runs: FixBenchScenarioRun[]
  suites: Array<{ suite: FixBenchSuite; total: number; diagnosis: number; fix: number; buildSuccess: number }>
  /** Correct diagnosis / total (target ≥ 0.8). */
  diagnosisAccuracy: number
  /** Fix applied without human modification / total (target ≥ 0.5). */
  fixAccuracy: number
  /** Hermetic build-success proxy rate. */
  buildSuccessRate: number
  /** False-positive rate: healthy controls that were wrongly flagged. */
  falsePositiveRate: number
  /** Median + p90 per-scenario wall clock. */
  timeMs: { median: number; p90: number; total: number }
  /** Estimated hours saved vs a 30-min-per-failure human baseline. */
  timeSavedHours: number
  /** Human-intervention rate: scenarios the pipeline could NOT auto-fix. */
  humanInterventionRate: number
}

export interface FixBenchOptions {
  /** Scenario directory override (default: bench/fix). */
  scenariosDir?: string
  /** Run only scenarios in this suite. */
  suite?: string
  /** Run only scenarios with these ids. */
  ids?: string[]
  /** Injectable command runner (stubbed in hermetic runs; real builds are
   * never required — build success is scored by re-diagnosis). */
  run?: (command: string, args: string[], options: { cwd: string; timeout?: number }) => Promise<{ success: boolean; stdout: string; stderr: string; exitCode: number }>
  /** Progress hooks (CLI streaming). */
  onScenarioStart?: (info: { index: number; total: number; scenario: FixBenchScenario }) => void
  onScenarioComplete?: (info: { index: number; total: number; scenario: FixBenchScenario; run: FixBenchScenarioRun }) => void
}

/** Validate a parsed scenario file; empty array = valid. */
export function validateFixBenchScenario(raw: unknown): string[] {
  const problems: string[] = []
  if (!raw || typeof raw !== 'object') return ['scenario is not an object']
  const s = raw as Record<string, unknown>

  if (typeof s.id !== 'string' || !s.id.trim()) problems.push('missing string field: id')
  if (s.specVersion !== FIX_BENCH_SPEC_VERSION) {
    problems.push(`specVersion must be ${FIX_BENCH_SPEC_VERSION}, got ${String(s.specVersion)}`)
  }
  if (typeof s.suite !== 'string' || !s.suite.trim()) problems.push('missing string field: suite')
  if (typeof s.title !== 'string' || !s.title.trim()) problems.push('missing string field: title')
  if (typeof s.issue !== 'string' || !s.issue.trim()) problems.push('missing string field: issue')

  for (const key of ['broken', 'healthy'] as const) {
    const rec = s[key]
    if (!rec || typeof rec !== 'object' || Array.isArray(rec)) {
      problems.push(`missing record field: ${key}`)
    } else {
      for (const [path, content] of Object.entries(rec as Record<string, unknown>)) {
        if (typeof content !== 'string') problems.push(`${key}["${path}"] must be a string`)
      }
    }
  }

  const expect = s.expect as Partial<FixBenchExpect> | undefined
  if (!expect || typeof expect !== 'object') {
    problems.push('missing object field: expect')
  } else {
    if (typeof expect.diagnosisId !== 'string' || !expect.diagnosisId.trim()) {
      problems.push('expect.diagnosisId must be a non-empty string')
    }
    if (!Array.isArray(expect.diagnosisKeywords) || expect.diagnosisKeywords.some(k => typeof k !== 'string')) {
      problems.push('expect.diagnosisKeywords must be a string array')
    }
    if (typeof expect.fixFile !== 'string' || !expect.fixFile.trim()) problems.push('expect.fixFile must be a non-empty string')
    if (!Array.isArray(expect.mustContain) || expect.mustContain.some(k => typeof k !== 'string')) {
      problems.push('expect.mustContain must be a string array')
    }
    if (!Array.isArray(expect.mustNotContain) || expect.mustNotContain.some(k => typeof k !== 'string')) {
      problems.push('expect.mustNotContain must be a string array')
    }
    if (typeof expect.autoFixable !== 'boolean') problems.push('expect.autoFixable must be a boolean')
  }

  return problems
}
