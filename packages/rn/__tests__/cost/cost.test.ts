/**
 * vectalon cost — Cost Governance Agent (Roadmap 099) — hermetic tests.
 * Business Source License 1.1 (BSL-1.1)
 */
import { runCost, datasetFiles, RATE_ASSUMPTIONS } from '../../src/cost'
import { createTempProject, cleanup } from '../helpers/tmp'

describe('cost: runCost', () => {
  let dir: string
  afterEach(() => cleanup(dir))

  it('estimates LoRA training from the lora config', () => {
    dir = createTempProject({
      '.vectalon/lora/config.json': JSON.stringify({ model: 'qwen2.5-coder-7b', vramGb: 16 }),
    })
    const report = runCost(dir)
    expect(report.lines.some(l => l.id === 'lora-training')).toBe(true)
    const training = report.lines.find(l => l.id === 'lora-training')!
    expect(training.amountUsd).toBeCloseTo(6 * RATE_ASSUMPTIONS.gpuHour)
    expect(report.assumptions.length).toBe(3)
  })

  it('estimates eval inference from case count', () => {
    dir = createTempProject({
      '.vectalon/evals/cases.json': JSON.stringify({ cases: [{ id: 'a' }, { id: 'b' }] }),
    })
    const report = runCost(dir)
    const evalLine = report.lines.find(l => l.id === 'eval-runs')
    expect(evalLine).toBeDefined()
    expect(evalLine!.amountUsd).toBeCloseTo((2 * 2000 / 1_000_000) * RATE_ASSUMPTIONS.perMTokens)
  })

  it('reports no-cost-surfaces and approves an empty project', () => {
    dir = createTempProject({ 'package.json': '{}' })
    const report = runCost(dir)
    expect(report.lines).toHaveLength(0)
    expect(report.totalUsd).toBe(0)
    expect(report.verdict).toBe('approved')
    expect(report.findings.some(f => f.id === 'no-cost-surfaces')).toBe(true)
  })

  it('sums training + eval lines and scales VRAM class', () => {
    dir = createTempProject({
      '.vectalon/lora/config.json': JSON.stringify({ model: 'big', vramGb: 32 }),
      '.vectalon/evals/cases.json': JSON.stringify(Array.from({ length: 300 }, (_, i) => ({ id: `c${i}` }))),
    })
    const report = runCost(dir)
    // 12 GPU-hours (big-VRAM tier) + ~600k eval tokens
    expect(report.totalUsd).toBeCloseTo(12 * RATE_ASSUMPTIONS.gpuHour + 0.6 * RATE_ASSUMPTIONS.perMTokens, 2)
    expect(report.verdict).toBe('approved')
  })
})

describe('cost: datasetFiles', () => {
  it('lists jsonl/json files under .vectalon/dataset', () => {
    const dir = createTempProject({
      '.vectalon/dataset/train.jsonl': '{}\n',
      '.vectalon/dataset/notes.md': 'x',
    })
    expect(datasetFiles(dir)).toEqual(['.vectalon/dataset/train.jsonl'])
    cleanup(dir)
  })
})
