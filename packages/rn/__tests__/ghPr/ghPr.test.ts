/**
 * vectalon gh-pr — GitHub PR Triage Agent (Roadmap 090) — hermetic tests.
 * Business Source License 1.1 (BSL-1.1)
 */
import { analyzePrs, loadPrExport, rollCiStatus, runGhPr } from '../../src/ghPr'
import type { GhPrRaw } from '../../src/ghPr'
import { createTempProject, cleanup } from '../helpers/tmp'

const NOW = Date.UTC(2026, 7, 15) // Aug 15 2026
const day = 86_400_000
const iso = (offsetDays: number): string => new Date(NOW - offsetDays * day).toISOString()

/** Minimal gh pr list record builder. */
function pr(overrides: Partial<GhPrRaw> = {}): GhPrRaw {
  return {
    number: 1,
    title: 'feat: add thing',
    author: { login: 'alice' },
    createdAt: iso(2),
    updatedAt: iso(1),
    additions: 40,
    deletions: 10,
    isDraft: false,
    reviewDecision: 'APPROVED',
    mergeable: 'MERGEABLE',
    statusCheckRollup: [{ name: 'ci', conclusion: 'SUCCESS', status: 'COMPLETED' }],
    ...overrides,
  }
}

describe('ghPr: rollCiStatus', () => {
  it('rolls a completed pass to passing', () => {
    expect(rollCiStatus([{ name: 'ci', conclusion: 'SUCCESS', status: 'COMPLETED' }])).toEqual({ state: 'passing', failures: [] })
  })

  it('collects failing conclusion names', () => {
    const r = rollCiStatus([
      { name: 'lint', conclusion: 'SUCCESS', status: 'COMPLETED' },
      { name: 'test', conclusion: 'FAILURE', status: 'COMPLETED' },
      { name: 'build', conclusion: 'TIMED_OUT', status: 'COMPLETED' },
    ])
    expect(r.state).toBe('failing')
    expect(r.failures).toEqual(['test', 'build'])
  })

  it('flags in-progress checks as pending', () => {
    expect(rollCiStatus([{ name: 'ci', status: 'IN_PROGRESS' }]).state).toBe('pending')
  })

  it('reports none when there are no checks', () => {
    expect(rollCiStatus([])).toEqual({ state: 'none', failures: [] })
  })
})

describe('ghPr: analyzePrs', () => {
  it('approves a healthy small PR', () => {
    const report = analyzePrs([pr()], NOW)
    expect(report.prs[0].verdict).toBe('approved')
    expect(report.verdict).toBe('approved')
    expect(report.summary.healthy).toBe(1)
    expect(report.findings.length).toBe(0)
  })

  it('flags a stale, huge, conflicting PR with failing CI as a blocker', () => {
    const report = analyzePrs(
      [
        pr({
          number: 42,
          createdAt: iso(45),
          updatedAt: iso(40),
          additions: 900,
          deletions: 800,
          reviewDecision: 'CHANGES_REQUESTED',
          mergeable: 'CONFLICTING',
          statusCheckRollup: [{ name: 'e2e', conclusion: 'FAILURE', status: 'COMPLETED' }],
        }),
      ],
      NOW,
    )
    const p = report.prs[0]
    expect(p.ageDays).toBe(45)
    expect(p.sizeLines).toBe(1700)
    expect(p.ciState).toBe('failing')
    expect(p.verdict).toBe('changes-requested')
    expect(report.verdict).toBe('changes-requested')
    expect(report.summary.blockers).toBe(1)
    const ids = report.findings.map(f => f.id)
    expect(ids).toContain('pr-stale')
    expect(ids).toContain('pr-huge')
    expect(ids).toContain('pr-conflict')
    expect(ids).toContain('pr-ci-failing')
    expect(ids).toContain('pr-changes-requested')
  })

  it('marks needs-attention for warnings that are not blockers', () => {
    const report = analyzePrs([pr({ number: 7, createdAt: iso(35), additions: 1600 })], NOW)
    expect(report.prs[0].verdict).toBe('needs-attention')
    expect(report.verdict).toBe('needs-attention')
  })

  it('sorts blockers first, then attention, oldest first', () => {
    const report = analyzePrs(
      [pr({ number: 1, createdAt: iso(2) }), pr({ number: 2, mergeable: 'CONFLICTING', createdAt: iso(3) }), pr({ number: 3, createdAt: iso(40), additions: 2000 })],
      NOW,
    )
    expect(report.prs.map(p => p.number)).toEqual([2, 3, 1])
  })

  it('reports unreviewed and draft PRs as informational', () => {
    const report = analyzePrs([pr({ number: 9, reviewDecision: null, isDraft: true })], NOW)
    const ids = report.findings.map(f => f.id)
    expect(ids).toContain('pr-draft')
    expect(report.prs[0].verdict).toBe('approved')
  })
})

describe('ghPr: runGhPr data sources', () => {
  let dir: string
  afterEach(() => cleanup(dir))

  it('degrades to an explicit no-data verdict when gh is unavailable', () => {
    dir = createTempProject({ 'package.json': '{}' })
    const report = runGhPr(dir)
    expect(report.source).toBe('none')
    expect(report.verdict).toBe('changes-requested')
    expect(report.findings.some(f => f.id === 'no-data')).toBe(true)
  })

  it('reads PR data from a --file export', () => {
    dir = createTempProject({
      'prs.json': JSON.stringify([pr({ number: 5, createdAt: iso(60) })]),
    })
    const report = runGhPr(dir, { file: `${dir}/prs.json` })
    expect(report.source).toBe('export-file')
    expect(report.prs).toHaveLength(1)
    expect(report.prs[0].number).toBe(5)
    expect(report.prs[0].verdict).toBe('needs-attention')
  })

  it('reports an unreadable export file', () => {
    dir = createTempProject({})
    const report = runGhPr(dir, { file: `${dir}/missing.json` })
    expect(report.source).toBe('none')
    expect(report.findings.some(f => f.id === 'file-unreadable')).toBe(true)
  })

  it('loadPrExport returns null for a missing or malformed file', () => {
    dir = createTempProject({ 'bad.json': '{ nope' })
    expect(loadPrExport(`${dir}/missing.json`)).toBeNull()
    expect(loadPrExport(`${dir}/bad.json`)).toBeNull()
  })
})
