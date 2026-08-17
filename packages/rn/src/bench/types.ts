/**
 * Phase V-5 benchmark — versioned scenario spec shape (M1).
 *
 * A scenario describes one "RN coding test": the prompt the harness is given,
 * the fixture project it runs in, the files/behaviors it must produce, and the
 * axes it is scored on. The `specVersion` field is validated so scenario files
 * can evolve without silently breaking the runner.
 */

export const SCENARIO_SPEC_VERSION = 1

/** The three scored axes from docs/BENCHMARK_PLAN.md. */
export type BenchAxes = 'correctness' | 'adherence' | 'guardrails'

export interface BenchScenarioExpect {
  /** File paths the generated code is expected to produce (relative to root). */
  files: string[]
  /** Free-form behaviors; scored by the rubric (M2). */
  behaviors: string[]
}

export interface BenchScenarioCorrectness {
  /** Whether the axis expects real tests/typecheck/lint to run and pass. */
  tests: boolean
  typecheck: boolean
  lint: boolean
}

export interface BenchScenario {
  /** Stable id, e.g. `rn-01-login-screen`. */
  id: string
  /** Must equal SCENARIO_SPEC_VERSION. */
  specVersion: number
  /** Suite grouping for the leaderboard (core-ui, data-flow, navigation, ...). */
  suite: string
  title: string
  prompt: string
  /** When true, the deterministic scaffold baseline can generate output for
   * this scenario; when false the scenario is model-only. */
  scaffoldable: boolean
  /** Package names this scenario removes (dependency-removal evals). The
   * `no-removed-native-traces` rubric check scores generated native config
   * against these. */
  removedDependencies?: string[]
  /** Deterministic literal edits this scenario's fix seam applies to the
   * fixture files (upgrade-breakage and debugging evals). The `fix-applied`
   * rubric check scores generated files against these: each edit's `replace`
   * must be present and its `find` must not (unless identical). */
  fixEdits?: Array<{ file: string; find: string; replace: string }>
  /** Files written into the throwaway temp project before generation. */
  fixtures: Record<string, string>
  expect: BenchScenarioExpect
  correctness: BenchScenarioCorrectness
  /** Which axes to score for this scenario. */
  axes: BenchAxes[]
}

/** A generated file in the benchmark's throwaway project. */
export interface BenchGeneratedFile {
  path: string
  content: string
}

export interface ScenarioGuardrailFile {
  path: string
  passed: number
  failed: number
  skipped: number
  ok: boolean
}

/** Score per axis; `null` means N/A for that run (e.g. correctness in
 * simulated mode, adherence before the rubric exists). */
export interface BenchAxisScores {
  correctness: number | null
  adherence: number | null
  guardrails: number | null
}

/** Relative-to-human scores (M6): generated / reference per axis, when both exist. */
export interface BenchReferenceScore {
  /** Reference files scored. */
  files: string[]
  axes: BenchAxisScores
  /** Renormalized composite of the reference solution itself. */
  composite: number | null
  /** generated / reference per axis; null when either side is N/A or zero. */
  relative: BenchAxisScores & { composite: number | null }
}

export interface BenchScenarioRun {
  id: string
  title: string
  suite: string
  scaffoldable: boolean
  generatedFiles: string[]
  guardrail: ScenarioGuardrailFile[]
  axes: BenchAxisScores
  /** Renormalized weighted composite over the available axes (0–1). */
  composite: number | null
  /** Per-check correctness detail lines (only present in live runs). */
  correctnessDetails?: string[]
  /** Human reference score + relative-to-human (M6); absent when no reference. */
  reference?: BenchReferenceScore
}

export interface BenchSuiteSummary {
  suite: string
  scenarioIds: string[]
  composite: number | null
  guardrails: number | null
}

export interface BenchSummary {
  specVersion: number
  runs: BenchScenarioRun[]
  suites: BenchSuiteSummary[]
  overallComposite: number | null
  overallGuardrails: number | null
  /** Average reference composite over runs that have a reference (M6). */
  overallReferenceComposite: number | null
  /** Average generated/reference composite over runs that have both (M6). */
  overallRelativeComposite: number | null
}

export interface BenchRunOptions {
  /** Directory containing the scenario JSON files. */
  scenariosDir?: string
  /** Directory containing human reference solutions (M6); default bench/references. */
  referencesDir?: string
  /** When true, correctness runs real tests/typecheck/lint in the temp project
   * (requires installed deps). Default false → correctness is N/A. */
  live?: boolean
  /** When true (with `live`), run `npm install` in the temp project before the
   * correctness checks — needed for the nightly CI leaderboard, where the
   * fixture project has a package.json but no node_modules yet. */
  install?: boolean
  /** Rubric seam (M2): score RN best-practice adherence for generated files. */
  rubric?: (files: BenchGeneratedFile[]) => number | null
  /** Override the deterministic scaffold generator (e.g. a real model). */
  generate?: (scenario: BenchScenario) => BenchGeneratedFile[] | Promise<BenchGeneratedFile[]>
  /** When set (M5), runBenchmarkFromDir builds a ModelRouter-backed generate seam. */
  modelRouter?: import('../model/ModelRouter').ModelRouter
  /** scenario id → reference files (M6); runScenario uses the entry for its scenario. */
  references?: Record<string, BenchGeneratedFile[]>
  /** Filter which scenarios run. */
  filter?: {
    suite?: string
    scaffoldable?: boolean
    ids?: string[]
    /** Also run dependency-removal scenarios (scaffoldable=false, but
     * deterministic via the removal seam). Set by the baseline default. */
    includeRemovals?: boolean
    /** Also run fix scenarios (scaffoldable=false with `fixEdits`, but
     * deterministic via the fix seam — upgrade/debugging evals). Set by the
     * baseline default. */
    includeFixes?: boolean
  }
  /** Executor for live correctness commands (injectable for tests). */
  runCommand?: (cmd: string, args: string[], opts: { cwd: string }) => Promise<{ success: boolean; exitCode: number; stdout: string; stderr: string }>
  /**
   * Live progress hooks (V5 UX): called as each scenario starts and finishes,
   * so a long model-backed pass shows movement instead of hanging silently.
   * `index` is 1-based within the filtered run set; `total` is the count.
   */
  onScenarioStart?: (info: { index: number; total: number; scenario: BenchScenario }) => void
  onScenarioComplete?: (info: { index: number; total: number; scenario: BenchScenario; run: BenchScenarioRun }) => void
}

/** Validate a parsed scenario file; returns a list of problems (empty = valid). */
export function validateScenario(raw: unknown): string[] {
  const problems: string[] = []
  if (!raw || typeof raw !== 'object') return ['scenario is not an object']
  const s = raw as Record<string, unknown>

  if (typeof s.id !== 'string' || !s.id.trim()) problems.push('missing string field: id')
  if (s.specVersion !== SCENARIO_SPEC_VERSION) {
    problems.push(`specVersion must be ${SCENARIO_SPEC_VERSION}, got ${String(s.specVersion)}`)
  }
  if (typeof s.suite !== 'string' || !s.suite.trim()) problems.push('missing string field: suite')
  if (typeof s.title !== 'string' || !s.title.trim()) problems.push('missing string field: title')
  if (typeof s.prompt !== 'string' || !s.prompt.trim()) problems.push('missing string field: prompt')
  if (typeof s.scaffoldable !== 'boolean') problems.push('missing boolean field: scaffoldable')

  if (!s.fixtures || typeof s.fixtures !== 'object' || Array.isArray(s.fixtures)) {
    problems.push('missing record field: fixtures')
  } else {
    for (const [path, content] of Object.entries(s.fixtures as Record<string, unknown>)) {
      if (typeof content !== 'string') problems.push(`fixture "${path}" must be a string`)
    }
  }

  if (s.fixEdits !== undefined) {
    if (!Array.isArray(s.fixEdits) || s.fixEdits.length === 0) {
      problems.push('fixEdits must be a non-empty array when present')
    } else {
      for (const edit of s.fixEdits as Array<Record<string, unknown>>) {
        if (typeof edit.file !== 'string' || !edit.file.trim()) problems.push('fixEdits entry missing string field: file')
        if (typeof edit.find !== 'string') problems.push(`fixEdits ${String(edit.file)} missing string field: find`)
        if (typeof edit.replace !== 'string') problems.push(`fixEdits ${String(edit.file)} missing string field: replace`)
      }
    }
  }

  const expect = s.expect as Partial<BenchScenarioExpect> | undefined
  if (!expect || typeof expect !== 'object') {
    problems.push('missing object field: expect')
  } else {
    if (!Array.isArray(expect.files) || expect.files.some(f => typeof f !== 'string')) {
      problems.push('expect.files must be a string array')
    }
    if (!Array.isArray(expect.behaviors) || expect.behaviors.some(b => typeof b !== 'string')) {
      problems.push('expect.behaviors must be a string array')
    }
  }

  const correctness = s.correctness as Partial<BenchScenarioCorrectness> | undefined
  if (!correctness || typeof correctness !== 'object') {
    problems.push('missing object field: correctness')
  } else {
    for (const key of ['tests', 'typecheck', 'lint'] as const) {
      if (typeof correctness[key] !== 'boolean') problems.push(`correctness.${key} must be a boolean`)
    }
  }

  if (!Array.isArray(s.axes) || s.axes.length === 0) {
    problems.push('missing non-empty array field: axes')
  } else {
    const valid: BenchAxes[] = ['correctness', 'adherence', 'guardrails']
    for (const axis of s.axes) {
      if (!valid.includes(axis as BenchAxes)) problems.push(`unknown axis: ${String(axis)}`)
    }
  }

  if (s.removedDependencies !== undefined) {
    if (
      !Array.isArray(s.removedDependencies) ||
      s.removedDependencies.length === 0 ||
      s.removedDependencies.some(d => typeof d !== 'string' || !d.trim())
    ) {
      problems.push('removedDependencies must be a non-empty string array when present')
    }
  }

  return problems
}
