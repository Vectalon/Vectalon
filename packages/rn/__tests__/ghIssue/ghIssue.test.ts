/**
 * vectalon gh-issue — GitHub Issue Intelligence Agent (Roadmap 091) — hermetic tests.
 * Business Source License 1.1 (BSL-1.1)
 */
import { analyzeIssues, runGhIssue, loadIssueExport } from '../../src/ghIssue'
import type { GhIssueRaw } from '../../src/ghIssue'
import { createTempProject, cleanup } from '../helpers/tmp'

const NOW = Date.UTC(2026, 7, 15) // Aug 15 2026
const day = 86_400_000
const iso = (offsetDays: number): string => new Date(NOW - offsetDays * day).toISOString()

function issue(overrides: Partial<GhIssueRaw> = {}): GhIssueRaw {
  return {
    number: 1,
    title: 'Bug: screen flashes on navigation',
    author: { login: 'alice' },
    createdAt: iso(2),
    updatedAt: iso(1),
    labels: [{ name: 'bug' }],
    assignees: [{ login: 'bob' }],
    ...overrides,
  }
}

describe('ghIssue: analyzeIssues', () => {
  it('approves a fresh, triaged issue', () => {
    const report = analyzeIssues([issue()], NOW)
    expect(report.verdict).toBe('approved')
    expect(report.summary.total).toBe(1)
    expect(report.summary.triaged).toBe(1)
    expect(report.findings.length).toBe(0)
  })

  it('flags a stale unassigned issue as changes-requested', () => {
    const report = analyzeIssues([issue({ number: 5, createdAt: iso(45), updatedAt: iso(40), assignees: [] })], NOW)
    expect(report.issues[0].verdict).toBe('changes-requested')
    const ids = report.findings.map(f => f.id)
    expect(ids).toContain('issue-stale')
    expect(ids).toContain('issue-unassigned')
    expect(report.summary.stale).toBe(1)
  })

  it('notes unlabeled issues as informational', () => {
    const report = analyzeIssues([issue({ labels: [] })], NOW)
    expect(report.findings.some(f => f.id === 'issue-unlabeled' && f.severity === 'info')).toBe(true)
  })

  it('sorts worst issues first, oldest first within a verdict', () => {
    const report = analyzeIssues(
      [issue({ number: 1, createdAt: iso(2) }), issue({ number: 2, createdAt: iso(40), assignees: [] })],
      NOW,
    )
    expect(report.issues.map(i => i.number)).toEqual([2, 1])
  })

  it('flags a label-silent backlog of 5+ issues', () => {
    const raw = Array.from({ length: 5 }, (_, i) => issue({ number: i + 1, labels: [] }))
    const report = analyzeIssues(raw, NOW)
    expect(report.findings.some(f => f.id === 'labels-missing')).toBe(true)
  })
})

describe('ghIssue: runGhIssue data sources', () => {
  let dir: string
  afterEach(() => cleanup(dir))

  it('degrades to an explicit no-data verdict when gh is unavailable', () => {
    dir = createTempProject({ 'package.json': '{}' })
    const report = runGhIssue(dir)
    expect(report.source).toBe('none')
    expect(report.verdict).toBe('changes-requested')
    expect(report.findings.some(f => f.id === 'no-data')).toBe(true)
  })

  it('reads issue data from a --file export', () => {
    dir = createTempProject({ 'issues.json': JSON.stringify([issue({ number: 9, createdAt: iso(40) })]) })
    const report = runGhIssue(dir, { file: `${dir}/issues.json` })
    expect(report.source).toBe('export-file')
    expect(report.issues).toHaveLength(1)
    expect(report.issues[0].number).toBe(9)
  })

  it('reports an unreadable export file', () => {
    dir = createTempProject({})
    const report = runGhIssue(dir, { file: `${dir}/missing.json` })
    expect(report.source).toBe('none')
    expect(report.findings.some(f => f.id === 'file-unreadable')).toBe(true)
  })

  it('loadIssueExport returns null for a missing or malformed file', () => {
    dir = createTempProject({ 'bad.json': '{ nope' })
    expect(loadIssueExport(`${dir}/missing.json`)).toBeNull()
    expect(loadIssueExport(`${dir}/bad.json`)).toBeNull()
  })
})
