/**
 * vectalon release-predict — Release Prediction Agent (Roadmap Phase 10,
 * item 086) — Business Source License 1.1 (BSL-1.1)
 *
 * Runs one read-only `git log` and derives a deterministic release-risk
 * score from history: fix-commit density in the release window, churn (files
 * touched per commit), time since last commit, breaking changes, and author
 * breadth. Higher risk → the release needs more gate time. Reports to
 * docs/vectalon/release-predict/ (gitignored).
 */

import { execFileSync } from 'child_process'
import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { deriveFromGitHistory } from '../sdlc/GitHistoryDeriver'
import type { PredictFactor, PredictFinding, ReleasePredictionReport, ReleaseRisk } from './types'

export type { PredictFactor, PredictFinding, ReleasePredictionReport, ReleaseRisk } from './types'

/** Where release-predict reports are written. */
export const predictDocsDir = (root: string): string => join(root, 'docs', 'vectalon', 'release-predict')

const RISK_LEVELS: ReleaseRisk[] = ['low', 'moderate', 'high', 'critical']

/** Fetch the extended git log (degrades to null outside a git repo). */
export function readGitLog(root: string, maxCommits = 2000): string | null {
  try {
    // execFileSync skips the shell, so the `|` separators in the format stay intact.
    return execFileSync('git', ['log', '--format=%h|%an|%ai|%s', `-n ${maxCommits}`], { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString()
  } catch {
    return null
  }
}

/** Compute the release-risk report from a git-log string. */
export function analyzeGitLog(log: string, options: { targetDate?: number; windowDays?: number } = {}): Omit<ReleasePredictionReport, 'scannedAt' | 'root'> {
  const derivation = deriveFromGitHistory(log)
  const commits = derivation.commits
  const findings: PredictFinding[] = []
  const factors: PredictFactor[] = []
  const windowDays = options.windowDays ?? 14
  const now = options.targetDate ?? Date.now()
  const windowStart = now - windowDays * 86_400_000

  // Commits in the release window (by commit date).
  const windowCommits = commits.filter(c => {
    const t = c.date ? new Date(c.date).getTime() : 0
    return t >= windowStart && t <= now
  })
  const windowCount = windowCommits.length
  factors.push({ name: 'release-window-commits', value: windowCount, weight: 0.2, goodDirection: 'lower', rationale: 'Fewer commits in the window = smaller surface to regress.' })

  // Fix density in the window.
  const fixish = /fix|bug|hotfix|revert|rollback|patch/i
  const fixCount = windowCommits.filter(c => fixish.test(c.message ?? '')).length
  const fixDensity = windowCount > 0 ? fixCount / windowCount : 0
  factors.push({ name: 'fix-density', value: Math.round(fixDensity * 1000) / 1000, weight: 0.35, goodDirection: 'lower', rationale: 'High fix density near a release often means stability debt from earlier shortcuts.' })

  // Refactor/rewrite density in the window (proxy for churn and blast radius).
  const refactorish = /refactor|cleanup|rewrite|move|extract|rename/i
  const refactorCount = windowCommits.filter(c => refactorish.test(c.message ?? '')).length
  const refactorDensity = windowCount > 0 ? refactorCount / windowCount : 0
  factors.push({ name: 'refactor-density', value: Math.round(refactorDensity * 1000) / 1000, weight: 0.15, goodDirection: 'lower', rationale: 'Heavy refactoring near a release widens the blast radius of any single regression.' })

  // Time since the last commit (staleness → drift from trunk).
  let hoursSinceLast = 0
  const last = commits[0]
  if (last?.date) {
    hoursSinceLast = Math.max(0, (now - new Date(last.date).getTime()) / 3_600_000)
  }
  factors.push({ name: 'hours-since-last-commit', value: Math.round(hoursSinceLast * 10) / 10, weight: 0.1, goodDirection: 'lower', rationale: 'A cold branch drifts from trunk; CI only proves the last commit.' })

  // Breaking changes in the window.
  const breaking = derivation.stats.breaking
  factors.push({ name: 'breaking-changes', value: breaking, weight: 0.1, goodDirection: 'lower', rationale: 'Breaking changes need migration docs and coordinated consumer updates.' })

  // Author breadth in the window.
  const authorsInWindow = new Set(windowCommits.map(c => c.author?.trim() || '(unknown)')).size
  factors.push({ name: 'authors-in-window', value: authorsInWindow, weight: 0.1, goodDirection: 'higher', rationale: 'Broader author spread means more review coverage; a solo window is riskier.' })

  // Weighted risk score 0..100.
  const normalize = (factor: PredictFactor): number => {
    if (factor.name === 'authors-in-window') {
      // 1 author → 1.0, 5+ authors → 0.
      return Math.max(0, Math.min(1, 1 - (factor.value - 1) / 4))
    }
    if (factor.name === 'hours-since-last-commit') {
      return Math.min(1, factor.value / 168) // a week of staleness = full risk
    }
    if (factor.name === 'breaking-changes') {
      return Math.min(1, factor.value / 3)
    }
    if (factor.name === 'fix-density') {
      return Math.min(1, factor.value / 0.5)
    }
    // release-window-commits, refactor-density: linear scaling to a sane cap.
    const cap = factor.name === 'release-window-commits' ? 100 : 0.5
    return Math.min(1, factor.value / cap)
  }
  const score = Math.round(factors.reduce((sum, f) => sum + normalize(f) * f.weight * 100, 0))
  const risk: ReleaseRisk = score >= 45 ? 'critical' : score >= 32 ? 'high' : score >= 16 ? 'moderate' : 'low'

  const riskDescriptions: Record<ReleaseRisk, string> = {
    low: 'History looks stable — a standard gate (CI green + changelog + smoke test) should suffice.',
    moderate: 'Some risk signals present — run the full release checklist and a staged rollout.',
    high: 'High risk — require a code freeze, full regression pass, and a slow staged rollout with rollback ready.',
    critical: 'Critical risk — postpone or wrap the release in a feature flag; schedule a stabilization sprint first.',
  }

  if (score >= 32) {
    findings.push({
      id: 'release-risk', severity: score >= 45 ? 'warning' : 'info',
      message: `Predicted release risk ${risk} (score ${score}/100) for the ${windowDays}-day window: ${riskDescriptions[risk]}`,
      suggestion: 'Add release-gate checks: code freeze, full suite on the release candidate, smoke test on staging, staged rollout.',
    })
  }
  if (fixCount > 0) {
    findings.push({
      id: 'fix-density', severity: fixDensity > 0.3 ? 'warning' : 'info',
      message: `${fixCount} of ${windowCount} window commit(s) are fixes/rollbacks (${(fixDensity * 100).toFixed(0)}%)`,
      suggestion: 'Investigate the root causes instead of stacking fixes — recurring fix commits predict an unstable release.',
    })
  }
  if (windowCount === 0) {
    findings.push({
      id: 'no-window-commits', severity: 'info',
      message: 'No commits in the release window — the branch may be stale or the window too narrow.',
      suggestion: 'Widen the window or confirm the branch is being actively integrated.',
    })
  }

  const levelIndex = RISK_LEVELS.indexOf(risk)
  const verdict = levelIndex >= 3 ? 'changes-requested' : levelIndex === 2 ? 'needs-attention' : 'approved'
  return {
    score, risk, riskDescription: riskDescriptions[risk], windowDays, windowCommits: windowCount,
    totalCommits: commits.length, factors, findings, verdict,
  }
}

/** Run one release-predict pass. */
export function runReleasePredict(root: string): ReleasePredictionReport {
  const scannedAt = Date.now()
  const log = readGitLog(root)
  if (log === null) {
    return {
      scannedAt, root, score: 100, risk: 'critical', riskDescription: 'Cannot analyze — not a git repository',
      windowDays: 14, windowCommits: 0, totalCommits: 0, factors: [], findings: [{
        id: 'no-git', severity: 'warning',
        message: 'Not a git repository — no history to predict from',
        suggestion: 'Initialize git and commit history for release prediction to work.',
      }], verdict: 'changes-requested',
    }
  }
  return { scannedAt, root, ...analyzeGitLog(log) }
}

/** Render the prediction as markdown. */
export function renderPredictMarkdown(report: ReleasePredictionReport): string {
  const lines = ['# vectalon release-predict — Release Prediction', '']
  lines.push(`Risk: **${report.risk}**  ·  Score: ${report.score}/100  ·  Window: ${report.windowDays}d (${report.windowCommits} commits)  ·  Verdict: **${report.verdict}**`, '', report.riskDescription, '', '## Factors', '', '| Factor | Value | Weight | Direction |', '|---|---|---|---|')
  for (const f of report.factors) lines.push(`| ${f.name} | ${f.value} | ${Math.round(f.weight * 100)}% | ${f.goodDirection === 'lower' ? 'lower = safer' : 'higher = safer'} |`)
  lines.push('', '## Findings', '')
  for (const f of report.findings) {
    const mark = f.severity === 'warning' ? 'WARN' : 'INFO'
    lines.push(`### [${mark}] ${f.id}`, '', f.message, '', `**Suggestion**: ${f.suggestion}`, '')
  }
  return lines.join('\n')
}

/** Write the markdown + JSON report. */
export function writePredictReport(root: string, report: ReleasePredictionReport): { mdPath: string; jsonPath: string } {
  const dir = predictDocsDir(root)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const md = renderPredictMarkdown(report)
  const json = JSON.stringify(report, null, 2)
  const mdPath = join(dir, 'report.md')
  const jsonPath = join(dir, 'report.json')
  writeFileSync(mdPath, md, 'utf-8')
  writeFileSync(jsonPath, json, 'utf-8')
  return { mdPath, jsonPath }
}
