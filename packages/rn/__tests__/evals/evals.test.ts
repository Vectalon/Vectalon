/**
 * vectalon evals — Model Evaluation Harness (Roadmap 095) — hermetic tests.
 * Business Source License 1.1 (BSL-1.1)
 */
import { scoreCase, runEvals, runEvalsCommand, loadEvalCases } from '../../src/evals'
import type { EvalCase } from '../../src/evals'
import { createTempProject, cleanup, writeProjectFile } from '../helpers/tmp'

describe('evals: scoreCase', () => {
  it('scores exact matches', () => {
    expect(scoreCase({ id: 'a', input: 'hi', expected: 'hello', actual: ' hello ', mode: 'exact' }).passed).toBe(true)
    expect(scoreCase({ id: 'b', input: 'hi', expected: 'hello', actual: 'world', mode: 'exact' }).passed).toBe(false)
  })

  it('scores includes matches by default', () => {
    expect(scoreCase({ id: 'a', input: 'hi', expected: 'button', actual: 'the primary button is red' }).passed).toBe(true)
    expect(scoreCase({ id: 'b', input: 'hi', expected: 'button', actual: 'no match here' }).passed).toBe(false)
  })

  it('scores regex matches and rejects invalid regexes', () => {
    expect(scoreCase({ id: 'a', input: 'hi', expected: '^\\d{2}:\\d{2}$', actual: '12:30', mode: 'regex' }).passed).toBe(true)
    const invalid = scoreCase({ id: 'b', input: 'hi', expected: '(', actual: 'x', mode: 'regex' })
    expect(invalid.passed).toBe(false)
    expect(invalid.note).toContain('invalid regex')
  })
})

describe('evals: runEvals', () => {
  const cases: EvalCase[] = [
    { id: 'one', input: 'x', expected: 'ok', actual: 'ok', mode: 'exact' },
    { id: 'two', input: 'x', expected: 'ok', actual: 'nope', mode: 'exact' },
  ]

  it('computes pass rate and verdict', () => {
    const report = runEvals(cases)
    expect(report.passed).toBe(1)
    expect(report.failed).toBe(1)
    expect(report.passRate).toBe(50)
    // >10% failure rate escalates to changes-requested
    expect(report.verdict).toBe('changes-requested')
    expect(report.findings.some(f => f.id === 'eval-failed')).toBe(true)
  })

  it('flags a regression when pass rate drops more than 5pt', () => {
    const report = runEvals(cases, 90)
    expect(report.regression.delta).toBe(-40)
    expect(report.findings.some(f => f.id === 'eval-regression')).toBe(true)
  })

  it('does not flag a regression when the rate holds or improves', () => {
    const report = runEvals([{ id: 'one', input: 'x', expected: 'ok', actual: 'ok', mode: 'exact' }], 80)
    expect(report.regression.delta).toBe(20)
    expect(report.findings.some(f => f.id === 'eval-regression')).toBe(false)
  })

  it('notes an empty case set', () => {
    const report = runEvals([])
    expect(report.verdict).toBe('approved')
    expect(report.findings.some(f => f.id === 'no-cases')).toBe(true)
  })
})

describe('evals: runEvalsCommand', () => {
  let dir: string
  afterEach(() => cleanup(dir))

  it('loads cases from the default path and reports', () => {
    dir = createTempProject({})
    writeProjectFile(dir, '.vectalon/evals/cases.json', JSON.stringify({ cases: [{ id: 'one', input: 'x', expected: 'ok', actual: 'ok' }] }))
    const report = runEvalsCommand(dir)
    expect(report.cases).toHaveLength(1)
    expect(report.passRate).toBe(100)
    expect(report.verdict).toBe('approved')
  })

  it('accepts a --cases override', () => {
    dir = createTempProject({ 'alt.json': JSON.stringify([{ id: 'two', input: 'x', expected: 'x', actual: 'y', mode: 'exact' }]) })
    const report = runEvalsCommand(dir, { cases: `${dir}/alt.json` })
    expect(report.cases).toHaveLength(1)
    expect(report.passed).toBe(0)
  })

  it('reports a missing cases file', () => {
    dir = createTempProject({})
    const report = runEvalsCommand(dir)
    expect(report.verdict).toBe('changes-requested')
    expect(report.findings.some(f => f.id === 'no-cases')).toBe(true)
  })

  it('loadEvalCases accepts an array or { cases } shape', () => {
    dir = createTempProject({ 'arr.json': JSON.stringify([{ id: 'a', input: 'x', expected: 'e', actual: 'e' }]), 'obj.json': JSON.stringify({ cases: [{ id: 'b', input: 'x', expected: 'e', actual: 'e' }] }) })
    expect(loadEvalCases(`${dir}/arr.json`)).toHaveLength(1)
    expect(loadEvalCases(`${dir}/obj.json`)).toHaveLength(1)
    expect(loadEvalCases(`${dir}/missing.json`)).toBeNull()
  })
})
