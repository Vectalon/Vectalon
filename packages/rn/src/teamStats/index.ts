/**
 * vectalon team-stats — Team Productivity Analytics (Roadmap Phase 9,
 * item 077) — Business Source License 1.1 (BSL-1.1)
 *
 * Runs one read-only `git log` and derives productivity signals: commit
 * cadence, author distribution and bus factor, category mix, and change
 * velocity. Degrades gracefully when git is unavailable. Reports to
 * docs/vectalon/team-stats/ (gitignored).
 */

import { execFileSync } from 'child_process'
import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { deriveFromGitHistory } from '../sdlc/GitHistoryDeriver'
import type { AuthorStat, TeamStatFinding, TeamStatsReport } from './types'

export type { AuthorStat, TeamStatFinding, TeamStatsReport } from './types'

/** Where team-stats reports are written. */
export const teamStatsDocsDir = (root: string): string => join(root, 'docs', 'vectalon', 'team-stats')

/** Fetch the extended git log (degrades to null outside a git repo). */
export function readGitLog(root: string, maxCommits = 2000): string | null {
  try {
    // execFileSync skips the shell, so the `|` separators in the format stay intact.
    return execFileSync('git', ['log', '--format=%h|%an|%ai|%s', `-n ${maxCommits}`], { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString()
  } catch {
    return null
  }
}

/** Compute the productivity report from a git-log string. */
export function analyzeGitLog(log: string): Omit<TeamStatsReport, 'scannedAt' | 'root'> {
  const derivation = deriveFromGitHistory(log)
  const commits = derivation.commits
  const findings: TeamStatFinding[] = []

  // Author distribution + bus factor.
  const byAuthor = new Map<string, number>()
  for (const c of commits) {
    const author = c.author?.trim() || '(unknown)'
    byAuthor.set(author, (byAuthor.get(author) ?? 0) + 1)
  }
  const authors: AuthorStat[] = [...byAuthor.entries()]
    .map(([author, count]) => ({ author, commits: count, share: commits.length > 0 ? count / commits.length : 0 }))
    .sort((a, b) => b.commits - a.commits)
  const topAuthor = authors[0]
  const busFactor = topAuthor && topAuthor.share > 0.5 ? 1 : topAuthor && topAuthor.share > 0.33 ? 2 : Math.max(1, Math.round(1 / (topAuthor?.share || 1)))
  if (topAuthor && topAuthor.share > 0.5) {
    findings.push({
      id: 'bus-factor', severity: 'warning',
      message: `Bus factor 1: ${topAuthor.author} owns ${(topAuthor.share * 100).toFixed(0)}% of commits`,
      suggestion: 'Pair on critical modules and rotate ownership so a single departure cannot stall the project.',
    })
  }

  // Cadence.
  const spanDays = derivation.stats.dateRange
    ? Math.max(1, Math.round((new Date(derivation.stats.dateRange.to).getTime() - new Date(derivation.stats.dateRange.from).getTime()) / 86_400_000) + 1)
    : 1
  const cadencePerDay = commits.length / spanDays
  if (cadencePerDay < 0.3) {
    findings.push({
      id: 'low-cadence', severity: 'warning',
      message: `Change velocity is low: ${cadencePerDay.toFixed(1)} commits/day over ${spanDays} day(s)`,
      suggestion: 'Ship smaller, more frequent changes — long gaps between commits widen review and integration cost.',
    })
  } else if (cadencePerDay > 20) {
    findings.push({
      id: 'high-cadence', severity: 'info',
      message: `High velocity: ${cadencePerDay.toFixed(1)} commits/day`,
      suggestion: 'Watch for review bottleneck — high commit volume needs fast, small reviews to stay healthy.',
    })
  }

  const breaking = derivation.stats.breaking
  if (breaking > 0) {
    findings.push({
      id: 'breaking-changes', severity: 'info',
      message: `${breaking} breaking change(s) in the history`,
      suggestion: 'Document each breaking change in the changelog — consumers need a migration path.',
    })
  }
  if (derivation.stats.authors.length <= 1) {
    findings.push({
      id: 'single-author', severity: 'info',
      message: 'History shows a single author',
      suggestion: 'Add review coverage: second set of eyes on every PR reduces single-owner risk.',
    })
  }

  return {
    totalCommits: commits.length,
    authors,
    busFactor,
    cadencePerDay,
    spanDays,
    breaking,
    categories: derivation.stats.categories,
    findings,
    verdict: findings.some(f => f.severity === 'warning') ? 'needs-attention' : 'approved',
  }
}

/** Run one team-stats pass. */
export function runTeamStats(root: string): TeamStatsReport {
  const scannedAt = Date.now()
  const log = readGitLog(root)
  if (log === null) {
    return {
      scannedAt, root, totalCommits: 0, authors: [], busFactor: 0, cadencePerDay: 0, spanDays: 0,
      breaking: 0, categories: {}, findings: [{
        id: 'no-git', severity: 'warning',
        message: 'Not a git repository — no history to analyze',
        suggestion: 'Initialize git and commit history for team analytics to work.',
      }], verdict: 'needs-attention',
    }
  }
  return { scannedAt, root, ...analyzeGitLog(log) }
}

/** Render the analytics as markdown. */
export function renderTeamStatsMarkdown(report: TeamStatsReport): string {
  const lines = ['# vectalon team-stats — Team Productivity Analytics', '']
  lines.push(`Commits: ${report.totalCommits}  ·  Authors: ${report.authors.length}  ·  Bus factor: ${report.busFactor}  ·  Cadence: ${report.cadencePerDay.toFixed(1)}/day  ·  Verdict: **${report.verdict}**`, '')
  lines.push('', '## Authors', '', '| Author | Commits | Share |', '|---|---|---|')
  for (const a of report.authors) lines.push(`| ${a.author} | ${a.commits} | ${(a.share * 100).toFixed(0)}% |`)
  lines.push('', '## Categories', '')
  for (const [cat, count] of Object.entries(report.categories)) lines.push(`- ${cat}: ${count}`)
  lines.push('', '## Findings', '')
  for (const f of report.findings) {
    const mark = f.severity === 'warning' ? 'WARN' : 'INFO'
    lines.push(`### [${mark}] ${f.id}`, '', f.message, '', `**Suggestion**: ${f.suggestion}`, '')
  }
  return lines.join('\n')
}

/** Write the markdown + JSON report. */
export function writeTeamStatsReport(root: string, report: TeamStatsReport): { mdPath: string; jsonPath: string } {
  const dir = teamStatsDocsDir(root)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const md = renderTeamStatsMarkdown(report)
  const json = JSON.stringify(report, null, 2)
  const mdPath = join(dir, 'report.md')
  const jsonPath = join(dir, 'report.json')
  writeFileSync(mdPath, md, 'utf-8')
  writeFileSync(jsonPath, json, 'utf-8')
  return { mdPath, jsonPath }
}
