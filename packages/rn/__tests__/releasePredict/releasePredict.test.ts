/**
 * vectalon release-predict — Release Prediction Agent (Roadmap 086) — hermetic tests.
 * Business Source License 1.1 (BSL-1.1)
 */
import { analyzeGitLog, readGitLog } from '../../src/releasePredict'
import { createTempProject, cleanup } from '../helpers/tmp'

/** Build a git-log string in the %h|%an|%ai|%s format the deriver parses. */
function logLine(hash: string, author: string, date: string, subject: string): string {
  return `${hash}|${author}|${date}|${subject}`
}

const NOW = Date.UTC(2026, 7, 15) // Aug 15 2026
const day = 86_400_000
const iso = (offsetDays: number): string => new Date(NOW - offsetDays * day).toISOString()

describe('releasePredict: analyzeGitLog', () => {
  it('scores a calm window as low risk', () => {
    const log = [
      logLine('a'.repeat(7), 'alice', iso(1), 'feat: add button'),
      logLine('b'.repeat(7), 'alice', iso(2), 'feat: add screen'),
      logLine('c'.repeat(7), 'bob', iso(3), 'docs: readme'),
    ].join('\n')
    const report = analyzeGitLog(log, { targetDate: NOW })
    expect(report.totalCommits).toBe(3)
    expect(report.windowCommits).toBe(3)
    expect(report.risk).toBe('low')
    expect(report.score).toBeLessThan(25)
    expect(report.factors.some(f => f.name === 'fix-density')).toBe(true)
    expect(report.factors.some(f => f.name === 'authors-in-window')).toBe(true)
  })

  it('scores a fix-heavy window as high risk', () => {
    const lines: string[] = []
    for (let i = 1; i <= 30; i++) {
      // Hex-ish hashes — the deriver only accepts [0-9a-f]{7,40}.
      lines.push(logLine(`a${i.toString(16).padStart(6, '0')}`, 'solo', iso(i), i % 2 === 0 ? 'fix: patch crash' : 'fix: patch bug'))
    }
    const report = analyzeGitLog(lines.join('\n'), { targetDate: NOW })
    expect(report.risk).toBe('critical')
    expect(report.score).toBeGreaterThanOrEqual(45)
    expect(report.findings.some(f => f.id === 'release-risk')).toBe(true)
    expect(report.findings.some(f => f.id === 'fix-density')).toBe(true)
  })

  it('reports an empty window as a finding', () => {
    const log = [logLine('a'.repeat(7), 'alice', iso(40), 'feat: old')].join('\n')
    const report = analyzeGitLog(log, { targetDate: NOW, windowDays: 14 })
    expect(report.windowCommits).toBe(0)
    expect(report.findings.some(f => f.id === 'no-window-commits')).toBe(true)
  })
})

describe('releasePredict: readGitLog + runReleasePredict', () => {
  let dir: string
  afterEach(() => cleanup(dir))

  it('degrades outside a git repo', () => {
    dir = createTempProject({ 'package.json': '{}' })
    expect(readGitLog(dir)).toBeNull()
  })
})
