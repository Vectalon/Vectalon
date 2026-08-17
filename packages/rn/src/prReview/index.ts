/**
 * vectalon pr — PR Review Agent (P0: \"Build GitHub PR integration\").
 * Business Source License 1.1 (BSL-1.1)
 *
 * The natural adoption workflow — GitHub → Vectalon → developer. When a PR
 * is opened, `vc pr` reviews the diff deterministically (zero model calls):
 * a five-check scorecard (Architecture, Dependencies, Security,
 * Performance, Testing) over the added lines only, the issues it found, the
 * health impact (last known score → projected after the PR's findings), and
 * a \"fix automatically\" affordance. `--comment` posts (or upserts, by
 * marker) the review as a bot comment on the PR. Report to
 * docs/vectalon/pr/ (gitignored).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { runCommand } from '../adapters/runCommand'
import { parseGithubRemote } from '../adapters/git'
import { runScore } from '../score'
import { parseUnifiedDiff } from './diff'
import { runChecks } from './checks'
import type { PrCheckResult, PrReviewIssue, PrReviewOptions, PrReviewReport, PrReviewSeverity, PrReviewVerdict } from './types'

export * from './types'
export { parseUnifiedDiff, addedLineSet } from './diff'
export { runChecks, FEATURE_DIRS, LOCKFILES } from './checks'

/** Marker embedded in the comment so repeated runs upsert one comment. */
export const PR_REVIEW_MARKER = 'vectalon-pr-review'

/** Where pr reports are written (mirrors other docs/vectalon/* dirs). */
export const prDocsDir = (root: string): string => join(root, 'docs', 'vectalon', 'pr')

const MAX_ISSUES = 12

/** Severity order for sorting issues (error first). */
const SEVERITY_RANK: Record<PrReviewSeverity, number> = { error: 0, warning: 1, info: 2 }

function ownerRepo(root: string): Promise<{ owner: string; repo: string } | null> {
  return (async () => {
    const remote = await runCommand('git', ['remote', 'get-url', 'origin'], { cwd: root })
    if (!remote.success) return null
    return parseGithubRemote(remote.stdout.trim())
  })()
}

interface GhPrView {
  number?: number
  title?: string | null
  baseRefName?: string | null
}

/** Detect the current branch's PR (number, title, base) via the gh CLI. */
async function detectPr(root: string, repo: { owner: string; repo: string }): Promise<GhPrView | null> {
  try {
    const out = await runCommand(
      'gh',
      ['pr', 'view', '--repo', `${repo.owner}/${repo.repo}`, '--json', 'number,title,baseRefName'],
      { cwd: root, timeout: 20_000 }
    )
    if (!out.success) return null
    return JSON.parse(out.stdout) as GhPrView
  } catch {
    return null
  }
}

/** Resolve the diff: explicit → gh CLI → git merge-base → working tree. */
async function resolveDiff(
  root: string,
  options: PrReviewOptions
): Promise<{ diff: string | null; source: string; number: number | null; title: string | null; base: string | null }> {
  let number = options.number ?? null
  let title: string | null = null
  let base = options.base ?? null

  if (options.diff !== undefined && options.diff.trim().length > 0) {
    return { diff: options.diff, source: '--diff', number, title, base }
  }
  if (options.diffFile) {
    try {
      if (!existsSync(options.diffFile)) {
        return { diff: null, source: '--diff-file', number, title, base }
      }
      return { diff: readFileSync(options.diffFile, 'utf-8'), source: '--diff-file', number, title, base }
    } catch {
      return { diff: null, source: '--diff-file', number, title, base }
    }
  }

  const repo = await ownerRepo(root)
  if (repo) {
    const view = number === null ? await detectPr(root, repo) : null
    if (view?.number) {
      number = view.number
      title = view.title ?? null
      base = view.baseRefName ?? base
    }
    if (number !== null) {
      const out = await runCommand(
        'gh',
        ['pr', 'diff', String(number), '--repo', `${repo.owner}/${repo.repo}`],
        { cwd: root, timeout: 30_000 }
      )
      if (out.success && out.stdout.trim().length > 0) {
        return { diff: out.stdout, source: 'gh', number, title, base }
      }
    }
  }

  const ref = options.base ?? 'origin/main'
  const merged = await runCommand('git', ['diff', '-U0', `${ref}...HEAD`], { cwd: root })
  if (merged.success && merged.stdout.trim().length > 0) {
    return { diff: merged.stdout, source: 'git', number, title, base: ref }
  }
  const working = await runCommand('git', ['diff', '-U0', 'HEAD'], { cwd: root })
  if (working.success && working.stdout.trim().length > 0) {
    return { diff: working.stdout, source: 'git-working-tree', number, title, base: 'HEAD' }
  }
  return { diff: null, source: 'none', number, title, base }
}

function noDataReport(root: string, source: string, number: number | null, base: string | null, message: string): PrReviewReport {
  return {
    scannedAt: Date.now(),
    root,
    source,
    number,
    title: null,
    base,
    changedFiles: [],
    additions: 0,
    deletions: 0,
    checks: [],
    issues: [{
      id: 'no-diff',
      dimension: 'architecture',
      severity: 'warning',
      priority: 'P1',
      file: '',
      line: 0,
      message,
      suggestion: 'Pass `--diff` / `--diff-file` with the unified diff, or run inside a GitHub repo with the `gh` CLI authed (or a git repo with an origin/main ref).',
    }],
    baseScore: null,
    projectedScore: null,
    verdict: 'needs-attention',
    commentPosted: false,
  }
}

/** Last known overall Health Score: the score report on the base branch. */
function readBaseScore(root: string): number | null {
  try {
    const p = join(root, 'docs', 'vectalon', 'score', 'report.json')
    if (!existsSync(p)) return null
    const parsed = JSON.parse(readFileSync(p, 'utf-8')) as { overall?: number }
    return typeof parsed.overall === 'number' ? parsed.overall : null
  } catch {
    return null
  }
}

const penalty = (severity: PrReviewSeverity): number => (severity === 'error' ? 10 : severity === 'warning' ? 5 : 2)

function buildChecks(issues: PrReviewIssue[]): PrCheckResult[] {
  const labels: Record<PrReviewIssue['dimension'], string> = {
    architecture: 'Architecture',
    dependencies: 'Dependencies',
    security: 'Security',
    performance: 'Performance',
    testing: 'Testing',
  }
  return (Object.keys(labels) as PrReviewIssue['dimension'][]).map(dim => {
    const dimIssues = issues.filter(i => i.dimension === dim)
    // Status keys off the PR priority, not the raw scanner severity: only P0
    // findings block (fail); static hints like render-phase setState — which
    // the roadmap example lists as P1 — read as warn, never fail.
    const status = dimIssues.some(i => i.priority === 'P0') ? 'fail' : dimIssues.length > 0 ? 'warn' : 'pass'
    return { dimension: dim, label: labels[dim], status, issueCount: dimIssues.length }
  })
}

/** Compute the verdict from the issue priorities (mirrors the scorecard rows). */
export function verdictOf(issues: PrReviewIssue[]): PrReviewVerdict {
  // Only P0 findings block; static hints (P1/P2) read as needs-attention.
  if (issues.some(i => i.priority === 'P0')) return 'changes-requested'
  if (issues.length > 0) return 'needs-attention'
  return 'approved'
}

/**
 * Run one PR review. `commenter` is the write seam the CLI injects (the git
 * adapter's marker-upsert); when provided and a PR number is known, the
 * review is posted and `commentPosted` flips to true.
 */
export async function runPrReview(
  root: string,
  options: PrReviewOptions = {},
  commenter?: (number: number, body: string) => Promise<void>
): Promise<PrReviewReport> {
  const scannedAt = Date.now()
  const { diff, source, number, title, base } = await resolveDiff(root, options)

  if (!diff) {
    return noDataReport(root, source, number, base, 'No diff available to review.')
  }

  const changed = parseUnifiedDiff(diff)
  if (changed.length === 0) {
    return noDataReport(root, source, number, base, 'The diff contains no file changes to review.')
  }

  const issues = runChecks(root, changed)
    .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity])
    .slice(0, MAX_ISSUES)
  const checks = buildChecks(issues)
  const verdict = verdictOf(issues)

  // Health impact: last known base score minus the PR's finding penalty.
  let baseScore = readBaseScore(root)
  if (baseScore === null) {
    try {
      baseScore = (await runScore(root, { skipAudit: true })).overall
    } catch {
      baseScore = null
    }
  }
  const projectedScore =
    baseScore === null ? null : Math.max(0, Math.min(100, baseScore - issues.reduce((s, i) => s + penalty(i.severity), 0)))

  const report: PrReviewReport = {
    scannedAt,
    root,
    source,
    number,
    title,
    base,
    changedFiles: changed.map(f => f.path),
    additions: changed.reduce((s, f) => s + f.additions, 0),
    deletions: changed.reduce((s, f) => s + f.deletions, 0),
    checks,
    issues,
    baseScore,
    projectedScore,
    verdict,
    commentPosted: false,
  }

  if (commenter && number !== null) {
    await commenter(number, renderPrComment(report))
    report.commentPosted = true
  }

  return report
}

// ---------------------------------------------------------------------------
// Rendering.
// ---------------------------------------------------------------------------

const STATUS_GLYPH = { pass: '✅', warn: '⚠️', fail: '✗' } as const

/** The bot comment body — upserted by marker, so re-runs update in place. */
export function renderPrComment(report: PrReviewReport): string {
  const lines: string[] = []
  lines.push(`<!-- ${PR_REVIEW_MARKER} -->`)
  lines.push('', '## 🤖 Vectalon — PR Review', '')
  lines.push(`**PR #${report.number ?? '—'}**${report.title ? ` — ${report.title}` : ''} · ${report.changedFiles.length} files · +${report.additions} −${report.deletions}`, '')
  lines.push('| Check | Status |')
  lines.push('|---|---|')
  for (const c of report.checks) {
    lines.push(`| ${c.label} | ${STATUS_GLYPH[c.status]}${c.issueCount > 0 ? ` (${c.issueCount})` : ''} |`)
  }

  if (report.issues.length > 0) {
    lines.push('', `**Found ${report.issues.length} issue${report.issues.length === 1 ? '' : 's'}**`, '')
    for (const i of report.issues) {
      const at = i.line > 0 ? ` — \`${i.file}:${i.line}\`` : ` — \`${i.file}\``
      lines.push(`- **${i.priority}** · ${i.dimension} · ${i.message}${at}`)
      lines.push(`  <sub>${i.suggestion}</sub>`)
    }
  } else {
    lines.push('', 'No issues found on the changed lines.', '')
  }

  if (report.baseScore !== null && report.projectedScore !== null) {
    lines.push('', `**Health impact: ${report.baseScore} → ${report.projectedScore}** (−${report.baseScore - report.projectedScore})`, '')
  }

  lines.push('', '> **[Fix automatically]** — run `vc fix` on this branch and Vectalon will apply the deterministic fixes, or wire up the `vectalon` GitHub Action to run `vc pr --comment` on every PR.', '')
  lines.push('---', '', `*Deterministic review — zero model calls. Re-run \`vc pr ${report.number ?? ''} --comment\` to refresh this comment.*`)
  return lines.join('\n')
}

/** Human-readable markdown report for docs/vectalon/pr/. */
export function renderPrMarkdown(report: PrReviewReport): string {
  const lines: string[] = []
  lines.push('# vectalon pr — PR Review Agent', '')
  lines.push(`- Source: ${report.source} · PR: ${report.number ?? '—'} · Base: ${report.base ?? '—'} · Verdict: **${report.verdict}**`)
  lines.push(`- Files: ${report.changedFiles.length} · +${report.additions} −${report.deletions}${report.baseScore !== null && report.projectedScore !== null ? ` · Health impact: **${report.baseScore} → ${report.projectedScore}**` : ''}`)
  lines.push('')
  lines.push('## Checks', '', '| Check | Status | Issues |', '|---|---|---|')
  for (const c of report.checks) lines.push(`| ${c.label} | ${c.status} | ${c.issueCount} |`)
  lines.push('')
  lines.push('## Issues', '')
  if (report.issues.length === 0) lines.push('No issues found on the changed lines.')
  for (const i of report.issues) {
    lines.push(`### [${i.priority}] ${i.dimension} — ${i.id} (${i.file}${i.line > 0 ? ':' + i.line : ''})`, '', i.message, '', `**Suggestion**: ${i.suggestion}`, '')
  }
  lines.push('')
  lines.push('## Changed files', '', ...report.changedFiles.map(f => `- \`${f}\``))
  return lines.join('\n')
}

/** Write report.json + report.md into docs/vectalon/pr/ (gitignored). */
export function writePrReviewReport(root: string, report: PrReviewReport): { jsonPath: string; mdPath: string } {
  const dir = prDocsDir(root)
  mkdirSync(dir, { recursive: true })
  const jsonPath = join(dir, 'report.json')
  const mdPath = join(dir, 'report.md')
  writeFileSync(jsonPath, JSON.stringify(report, null, 2) + '\n')
  writeFileSync(mdPath, renderPrMarkdown(report))
  return { jsonPath, mdPath }
}
