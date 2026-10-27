import localResult from '../../../packages/rn/bench/results/local.json'
import balancedResult from '../../../packages/rn/bench/results/local-3b.json'
import qualityResult from '../../../packages/rn/bench/results/local-7b.json'
import outcomeEvidence from '../../../docs/release-roadmap/evidence/one-app-v2-comparison-2026-10-25.json'
import repairEvidence from '../../../docs/release-roadmap/evidence/paired-repair-7b-2026-10-27.json'

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

export const REPAIR_TASK_OUTCOMES = [...new Set(repairEvidence.rows.map(row => row.task))].map(id => {
  const runs = repairEvidence.rows.filter(row => row.task === id)
  const count = (condition: string, selected: number) => runs.filter(row => row.condition === condition
    && row.app === 'passed' && row.typecheck && row.tests && row.selected === selected
    && (selected === 1 ? row.first === 'parsed' : row.second === 'repair')).length
  return {
    id,
    taskOnlyFirst: count('task-only', 1), guidedFirst: count('vectalon', 1),
    taskOnlyAssisted: count('task-only', 2), guidedAssisted: count('vectalon', 2),
    taskOnlyRuns: runs.filter(row => row.condition === 'task-only').length,
    guidedRuns: runs.filter(row => row.condition === 'vectalon').length,
  }
})
