/**
 * vectalon gh-ci — GitHub Workflow Reliability Agent (Roadmap 092) — hermetic tests.
 * Business Source License 1.1 (BSL-1.1)
 */
import { analyzeRuns, runGhCi, loadRunExport } from '../../src/ghCi'
import type { GhCiRunRaw } from '../../src/ghCi'
import { createTempProject, cleanup } from '../helpers/tmp'

function run(overrides: Partial<GhCiRunRaw> = {}): GhCiRunRaw {
  return {
    databaseId: 1,
    displayTitle: 'ci',
    workflowName: 'ci',
    conclusion: 'SUCCESS',
    status: 'COMPLETED',
    createdAt: new Date(Date.UTC(2026, 7, 14, 10)).toISOString(),
    updatedAt: new Date(Date.UTC(2026, 7, 14, 10, 12)).toISOString(),
    ...overrides,
  }
}

describe('ghCi: analyzeRuns', () => {
  it('approves a healthy all-green workflow', () => {
    const report = analyzeRuns([run(), run()])
    expect(report.verdict).toBe('approved')
    expect(report.summary.workflows).toBe(1)
    expect(report.summary.runs).toBe(2)
    expect(report.workflows[0].failureRate).toBe(0)
  })

  it('flags a workflow failing more than 15% of runs', () => {
    const report = analyzeRuns([run({ conclusion: 'SUCCESS' }), run({ conclusion: 'FAILURE' }), run({ conclusion: 'FAILURE' })])
    expect(report.workflows[0].failureRate).toBeCloseTo(2 / 3)
    expect(report.findings.some(f => f.id === 'workflow-failing')).toBe(true)
    expect(report.verdict).toBe('needs-attention')
  })

  it('detects flakiness when a workflow both passes and fails across >= 5 runs', () => {
    const runs = Array.from({ length: 10 }, (_, i) => run({ conclusion: i % 3 === 0 ? 'FAILURE' : 'SUCCESS' }))
    const report = analyzeRuns(runs)
    expect(report.workflows[0].flaky).toBe(true)
    expect(report.findings.some(f => f.id === 'workflow-flaky')).toBe(true)
  })

  it('flags slow workflows (avg > 30min) as informational', () => {
    const slow = (i: number): GhCiRunRaw =>
      run({
        databaseId: i,
        createdAt: new Date(Date.UTC(2026, 7, 14, 10)).toISOString(),
        updatedAt: new Date(Date.UTC(2026, 7, 14, 11, 30)).toISOString(),
      })
    const report = analyzeRuns([slow(1), slow(2), slow(3)])
    expect(report.findings.some(f => f.id === 'workflow-slow')).toBe(true)
  })

  it('notes when there are no workflow runs at all', () => {
    const report = analyzeRuns([])
    expect(report.findings.some(f => f.id === 'no-runs')).toBe(true)
    expect(report.verdict).toBe('approved')
  })
})

describe('ghCi: runGhCi data sources', () => {
  let dir: string
  afterEach(() => cleanup(dir))

  it('degrades to an explicit no-data verdict when gh is unavailable', () => {
    dir = createTempProject({ 'package.json': '{}' })
    const report = runGhCi(dir)
    expect(report.source).toBe('none')
    expect(report.verdict).toBe('changes-requested')
    expect(report.findings.some(f => f.id === 'no-data')).toBe(true)
  })

  it('reads runs from a --file export', () => {
    dir = createTempProject({ 'runs.json': JSON.stringify([run(), run({ conclusion: 'FAILURE' })]) })
    const report = runGhCi(dir, { file: `${dir}/runs.json` })
    expect(report.source).toBe('export-file')
    expect(report.summary.runs).toBe(2)
  })

  it('reports an unreadable export file', () => {
    dir = createTempProject({})
    const report = runGhCi(dir, { file: `${dir}/missing.json` })
    expect(report.source).toBe('none')
    expect(report.findings.some(f => f.id === 'file-unreadable')).toBe(true)
  })

  it('loadRunExport returns null for a missing or malformed file', () => {
    dir = createTempProject({ 'bad.json': '[{' })
    expect(loadRunExport(`${dir}/missing.json`)).toBeNull()
    expect(loadRunExport(`${dir}/bad.json`)).toBeNull()
  })
})
