import { BenchAxisScores, BenchGeneratedFile, ScenarioGuardrailFile } from './types'
import { runGuardrails } from '../guardrails'

/** Axis weights from docs/BENCHMARK_PLAN.md. */
export const AXIS_WEIGHTS: Record<keyof BenchAxisScores, number> = {
  correctness: 0.4,
  adherence: 0.3,
  guardrails: 0.3,
}

/** Correctness sub-weights (tests / typecheck / lint), capped so the axis
 * never exceeds 1.0 even with the optional runtime-smoke credit. */
export const CORRECTNESS_WEIGHTS = { tests: 0.5, typecheck: 0.25, lint: 0.25 }

/**
 * Renormalized weighted composite over the available (non-null) axes so
 * simulated runs (correctness N/A) and model-driven runs share one 0–1 scale.
 * Returns null when no axis is available.
 */
export function compositeScore(axes: BenchAxisScores): number | null {
  let weighted = 0
  let weightSum = 0
  const entries: Array<[keyof BenchAxisScores, number | null | undefined]> = [
    ['correctness', axes.correctness],
    ['adherence', axes.adherence],
    ['guardrails', axes.guardrails],
  ]
  for (const [key, value] of entries) {
    if (value === null || value === undefined) continue
    weighted += AXIS_WEIGHTS[key] * value
    weightSum += AXIS_WEIGHTS[key]
  }
  if (weightSum === 0) return null
  return weighted / weightSum
}

/** Guardrail pass rate = passing applications / (passing + failing); skipped
 * rules are excluded. Aggregated across files. Returns null with no files. */
export function guardrailPassRate(files: BenchGeneratedFile[]): number | null {
  let passed = 0
  let failed = 0
  for (const file of files) {
    const result = runGuardrails({
      filePath: file.path,
      content: file.content,
      conventions: { hasTypeScript: true, usesStyleSheet: true, hasNavigation: false },
    })
    passed += result.passed
    failed += result.failed
  }
  if (passed + failed === 0) return null
  return passed / (passed + failed)
}

/** Per-file guardrail detail for the report. */
export function guardrailPerFile(files: BenchGeneratedFile[]): ScenarioGuardrailFile[] {
  return files.map(file => {
    const result = runGuardrails({
      filePath: file.path,
      content: file.content,
      conventions: { hasTypeScript: true, usesStyleSheet: true, hasNavigation: false },
    })
    return {
      path: file.path,
      passed: result.passed,
      failed: result.failed,
      skipped: result.skipped,
      ok: result.ok,
    }
  })
}
