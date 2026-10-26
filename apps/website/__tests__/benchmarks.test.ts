import * as fs from 'fs'
import * as path from 'path'
import { MODEL_RESULTS, TASK_OUTCOMES } from '../lib/benchmarkData'

const repo = path.resolve(__dirname, '../../..')
const readJson = (file: string) => JSON.parse(fs.readFileSync(path.join(repo, file), 'utf8'))
const pct = (value: number | null) => value === null ? null : Math.round(value * 100)

describe('public benchmark evidence', () => {
  it('derives app-check outcomes from every recorded first attempt', () => {
    const evidence = readJson('docs/release-roadmap/evidence/one-app-v2-comparison-2026-10-25.json')
    expect(TASK_OUTCOMES).toHaveLength(evidence.reports.length)
    for (const task of TASK_OUTCOMES) {
      const runs = evidence.reports.find((report: { task: { id: string } }) => report.task.id === task.id).runs
      for (const [condition, passes, planned] of [
        ['task-only', task.taskOnlyPasses, task.taskOnlyPlanned],
        ['vectalon', task.guidedPasses, task.guidedPlanned],
      ] as const) {
        const attempts = runs.filter((row: { condition: string }) => row.condition === condition)
        expect(planned).toBe(attempts.length)
        expect(passes).toBe(attempts.filter((row: { status: string; identityMatched?: boolean; checks?: { typecheck?: { ok?: boolean }; tests?: { ok?: boolean } } }) =>
          row.status === 'passed' && row.identityMatched === true && row.checks?.typecheck?.ok === true && row.checks?.tests?.ok === true).length)
      }
    }
    expect(TASK_OUTCOMES.map(task => [task.taskOnlyPasses, task.guidedPasses])).toEqual([[0, 0], [3, 3], [0, 0]])
  })

  it('derives historical rubric scores and coverage from their own artifacts', () => {
    for (const item of MODEL_RESULTS) {
      const source = readJson(`packages/rn/bench/results/${item.file}`)
      expect(item.scenarios).toBe(source.runs.length)
      expect(item.composite).toBe(pct(source.overallComposite))
      expect(item.guardrails).toBe(pct(source.overallGuardrails))
    }
    expect(MODEL_RESULTS.map(item => item.scenarios)).toEqual([43, 13, 41])
  })

  it('keeps task evidence distinct from historical rubric marketing', () => {
    const page = fs.readFileSync(path.join(repo, 'apps/website/app/benchmarks/page.tsx'), 'utf8')
    expect(page).toContain('TASK_OUTCOMES.map')
    expect(page).toContain('MODEL_RESULTS.map')
    expect(page).not.toMatch(/human-authored|LoRA fine-tuning|97% composite/)
  })
})
