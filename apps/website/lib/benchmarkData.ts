import localResult from '../../../packages/rn/bench/results/local.json'
import balancedResult from '../../../packages/rn/bench/results/local-3b.json'
import qualityResult from '../../../packages/rn/bench/results/local-7b.json'
import outcomeEvidence from '../../../docs/release-roadmap/evidence/one-app-v2-comparison-2026-10-25.json'

const pct = (value: number | null | undefined): number | null =>
  typeof value === 'number' ? Math.round(value * 100) : null

export const MODEL_RESULTS = [
  { file: 'local.json', model: 'Qwen2.5-Coder 1.5B', result: localResult },
  { file: 'local-3b.json', model: 'Qwen2.5-Coder 3B', result: balancedResult },
  { file: 'local-7b.json', model: 'Qwen2.5-Coder 7B', result: qualityResult },
].map(({ file, model, result }) => ({
  file, model, scenarios: result.runs.length,
  composite: pct(result.overallComposite), guardrails: pct(result.overallGuardrails),
}))

export const TASK_OUTCOMES = outcomeEvidence.reports.map(report => {
  const runs = (condition: string) => report.runs.filter(row => row.condition === condition)
  const passes = (condition: string) => runs(condition).filter(row => row.status === 'passed' && row.identityMatched === true
    && row.checks?.typecheck?.ok === true && row.checks?.tests?.ok === true).length
  return {
    id: report.task.id, skill: report.task.kind,
    taskOnlyPasses: passes('task-only'), taskOnlyPlanned: runs('task-only').length,
    guidedPasses: passes('vectalon'), guidedPlanned: runs('vectalon').length,
  }
})
