/**
 * vectalon team-stats — Team Productivity Analytics (Roadmap 077) — hermetic tests.
 * Business Source License 1.1 (BSL-1.1)
 */
import { execSync } from 'child_process'
import { readFileSync } from 'fs'
import { analyzeGitLog, runTeamStats, readGitLog, writeTeamStatsReport } from '../../src/teamStats'
import { createTempProject, cleanup } from '../helpers/tmp'

const TWO_AUTHOR_LOG = [
  'a1b2c3d4|Alice|2026-08-01 10:00:00 +0000|feat: add login',
  'e5f6a7b8|Bob|2026-08-02 10:00:00 +0000|fix: login crash',
  'c9d0e1f2|Alice|2026-08-03 10:00:00 +0000|feat: add profile',
].join('\n')

const SINGLE_AUTHOR_LOG = [
  'a1b2c3d4|Solo|2026-08-01 10:00:00 +0000|feat: x',
  'e5f6a7b8|Solo|2026-08-01 11:00:00 +0000|fix: y',
].join('\n')

describe('team-stats: analyzeGitLog', () => {
  it('computes author distribution and cadence', () => {
    const report = analyzeGitLog(TWO_AUTHOR_LOG)
    expect(report.totalCommits).toBe(3)
    expect(report.authors).toHaveLength(2)
    expect(report.authors[0].author).toBe('Alice')
    expect(report.cadencePerDay).toBeGreaterThan(0)
    expect(report.spanDays).toBeGreaterThanOrEqual(3)
  })

  it('warns on bus factor 1', () => {
    const report = analyzeGitLog(SINGLE_AUTHOR_LOG)
    expect(report.busFactor).toBe(1)
    expect(report.findings.some(f => f.id === 'bus-factor' && f.severity === 'warning')).toBe(true)
  })

  it('classifies commit categories', () => {
    const report = analyzeGitLog(TWO_AUTHOR_LOG)
    expect(Object.keys(report.categories).length).toBeGreaterThan(0)
    expect(report.breaking).toBe(0)
  })
})

describe('team-stats: runTeamStats', () => {
  let dir: string
  afterEach(() => cleanup(dir))

  it('reads real git history when available', () => {
    dir = createTempProject({ 'package.json': '{}' })
    execSync('git init -q && git add -A && git -c user.email=t@t -c user.name=t commit -qm init', { cwd: dir })
    const log = readGitLog(dir)
    expect(log).not.toBeNull()
    const report = runTeamStats(dir)
    expect(report.totalCommits).toBeGreaterThanOrEqual(1)
    expect(report.authors.length).toBeGreaterThanOrEqual(1)
  })

  it('degrades gracefully outside a git repo', () => {
    dir = createTempProject({ 'package.json': '{}' })
    const report = runTeamStats(dir)
    expect(report.verdict).toBe('needs-attention')
    expect(report.findings.some(f => f.id === 'no-git')).toBe(true)
  })

  it('writes report.md and report.json', () => {
    dir = createTempProject({ 'package.json': '{}' })
    const report = analyzeGitLog(TWO_AUTHOR_LOG)
    const full = { ...report, scannedAt: Date.now(), root: dir }
    const { mdPath, jsonPath } = writeTeamStatsReport(dir, full)
    expect(readFileSync(mdPath, 'utf-8')).toContain('team-stats')
    expect(readFileSync(jsonPath, 'utf-8')).toContain('"busFactor"')
  })
})
