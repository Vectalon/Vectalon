/**
 * vectalon gh-pr — GitHub PR Triage Agent (Roadmap Phase 11, item 090)
 * Business Source License 1.1 (BSL-1.1)
 *
 * Scores every open PR's merge-readiness in one deterministic pass — age,
 * draft state, size (additions+deletions), review decision, CI check
 * rollup, and mergeability. Reads `gh pr list --json` when the GitHub CLI
 * is available, or a `--file` export with the same shape; when neither
 * exists it reports an explicit "no data" verdict instead of guessing.
 * Reports to docs/vectalon/gh-pr/ (gitignored).
 */

import { execFileSync } from 'child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { GhPrEntry, GhPrFinding, GhPrReport, GhPrSummary, GhPrVerdict } from './types'

export type { GhPrEntry, GhPrFinding, GhPrReport, GhPrSummary, GhPrVerdict } from './types'

/** Where gh-pr reports are written. */
export const ghPrDocsDir = (root: string): string => join(root, 'docs', 'vectalon', 'gh-pr')

/** Raw shape of one `gh pr list --json` record (the fields we read). */
export interface GhPrRaw {
  number: number
  title: string
  author?: { login?: string } | null
  createdAt?: string
  updatedAt?: string
  additions?: number
  deletions?: number
  isDraft?: boolean
  reviewDecision?: string | null
  mergeable?: string | null
  statusCheckRollup?: Array<{ name?: string | null; conclusion?: string | null; status?: string | null }>
  url?: string
}

export interface GhPrRunOptions {
  /** Read PR JSON from an export file instead of the gh CLI. */
  file?: string
  /** Maximum number of PRs to analyze. */
  maxPrs?: number
}

const FAILING_CONCLUSIONS = new Set(['FAILURE', 'ERROR', 'TIMED_OUT', 'CANCELLED', 'ACTION_REQUIRED', 'STARTUP_FAILURE', 'STALE'])
const PENDING_STATUSES = new Set(['IN_PROGRESS', 'QUEUED', 'PENDING', 'REQUESTED', 'WAITING'])
const STALE_PR_DAYS = 30
const IDLE_PR_DAYS = 7
const LARGE_PR_LINES = 600
const HUGE_PR_LINES = 1500

/** Roll `statusCheckRollup` down to a single state + failure names. */
export function rollCiStatus(rollup: GhPrRaw['statusCheckRollup']): { state: GhPrEntry['ciState']; failures: string[] } {
  if (!rollup || rollup.length === 0) return { state: 'none', failures: [] }
  const failures: string[] = []
  let pending = false
  for (const check of rollup) {
    const conclusion = check.conclusion ?? ''
    const status = check.status ?? ''
    if (FAILING_CONCLUSIONS.has(conclusion)) {
      failures.push(check.name || conclusion.toLowerCase())
    } else if (PENDING_STATUSES.has(status)) {
      pending = true
    }
  }
  if (failures.length > 0) return { state: 'failing', failures }
  if (pending) return { state: 'pending', failures }
  return { state: 'passing', failures }
}

/** Run `gh pr list` and return the raw records (null when unavailable). */
export function fetchGhPrs(root: string, maxPrs = 50): GhPrRaw[] | null {
  const fields = 'number,title,author,createdAt,updatedAt,additions,deletions,isDraft,reviewDecision,statusCheckRollup,mergeable,url'
  try {
    const out = execFileSync('gh', ['pr', 'list', '--state', 'open', '--limit', String(maxPrs), '--json', fields], {
      cwd: root,
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 20_000,
    }).toString()
    const parsed = JSON.parse(out) as GhPrRaw[]
    return Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

/** Read a `gh pr list --json` export file. */
export function loadPrExport(file: string): GhPrRaw[] | null {
  try {
    if (!existsSync(file)) return null
    const parsed = JSON.parse(readFileSync(file, 'utf-8')) as GhPrRaw[]
    return Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

const days = (ms: number): number => Math.max(0, Math.round(ms / 86_400_000))

/** Compute the per-PR + overall triage report from raw records. */
export function analyzePrs(raw: GhPrRaw[], now = Date.now()): Omit<GhPrReport, 'scannedAt' | 'root' | 'source'> {
  const prs: GhPrEntry[] = []
  const findings: GhPrFinding[] = []

  for (const r of raw) {
    const createdAt = r.createdAt ? new Date(r.createdAt).getTime() : now
    const updatedAt = r.updatedAt ? new Date(r.updatedAt).getTime() : createdAt
    const ageDays = days(now - createdAt)
    const idleDays = days(now - updatedAt)
    const additions = r.additions ?? 0
    const deletions = r.deletions ?? 0
    const sizeLines = additions + deletions
    const reviewDecision = r.reviewDecision ?? null
    const mergeable = r.mergeable ?? null
    const ci = rollCiStatus(r.statusCheckRollup)
    const author = r.author?.login ?? 'unknown'

    const prFindings: Array<{ id: string; severity: 'warning' | 'info'; message: string; suggestion: string }> = []

    if (ageDays > STALE_PR_DAYS) {
      prFindings.push({
        id: 'pr-stale',
        severity: 'warning',
        message: `PR #${r.number} has been open ${ageDays} days — it has drifted from trunk and is likely abandoned or blocked.`,
        suggestion: 'Re-base, split into smaller PRs, or close and reopen with a fresh description and owner.',
      })
    } else if (ageDays >= 14) {
      prFindings.push({
        id: 'pr-stale',
        severity: 'info',
        message: `PR #${r.number} has been open ${ageDays} days.`,
        suggestion: 'Confirm it still targets the current trunk before it goes stale.',
      })
    }

    if (r.isDraft) {
      prFindings.push({
        id: 'pr-draft',
        severity: 'info',
        message: `PR #${r.number} is a draft — it is not requesting review yet.`,
        suggestion: 'Mark ready for review when it is complete.',
      })
    }

    if (sizeLines > HUGE_PR_LINES) {
      prFindings.push({
        id: 'pr-huge',
        severity: 'warning',
        message: `PR #${r.number} touches ${sizeLines} lines (${additions}+/${deletions}-) — a review will miss defects at this size.`,
        suggestion: 'Split into reviewable chunks of a few hundred lines each.',
      })
    } else if (sizeLines > LARGE_PR_LINES) {
      prFindings.push({
        id: 'pr-large',
        severity: 'info',
        message: `PR #${r.number} touches ${sizeLines} lines (${additions}+/${deletions}-).`,
        suggestion: 'Consider splitting if review bandwidth is tight.',
      })
    }

    if (reviewDecision === 'CHANGES_REQUESTED') {
      prFindings.push({
        id: 'pr-changes-requested',
        severity: 'warning',
        message: `PR #${r.number} has requested changes from reviewers — it is not mergeable as-is.`,
        suggestion: 'Address the review comments and request a re-review.',
      })
    } else if ((reviewDecision === null || reviewDecision === 'REVIEW_REQUIRED') && !r.isDraft) {
      prFindings.push({
        id: 'pr-unreviewed',
        severity: 'info',
        message: `PR #${r.number} has no approval yet.`,
        suggestion: 'Assign reviewers so the change is verified before merge.',
      })
    }

    if (ci.state === 'failing') {
      prFindings.push({
        id: 'pr-ci-failing',
        severity: 'warning',
        message: `PR #${r.number} CI is failing (${ci.failures.join(', ')}).`,
        suggestion: 'Fix the failing checks or the merge is blocked by the CI gate.',
      })
    } else if (ci.state === 'pending') {
      prFindings.push({
        id: 'pr-ci-pending',
        severity: 'info',
        message: `PR #${r.number} CI is still running.`,
        suggestion: 'Wait for checks to complete before merging.',
      })
    } else if (ci.state === 'none') {
      prFindings.push({
        id: 'pr-ci-none',
        severity: 'info',
        message: `PR #${r.number} has no status checks.`,
        suggestion: 'Add a CI workflow so merges are gated on a green build.',
      })
    }

    if (mergeable === 'CONFLICTING') {
      prFindings.push({
        id: 'pr-conflict',
        severity: 'warning',
        message: `PR #${r.number} has merge conflicts with its base branch.`,
        suggestion: 'Re-base on the latest base branch and resolve conflicts.',
      })
    }

    if (idleDays >= IDLE_PR_DAYS && !r.isDraft && ageDays <= STALE_PR_DAYS) {
      prFindings.push({
        id: 'pr-idle',
        severity: 'info',
        message: `PR #${r.number} has had no activity in ${idleDays} days.`,
        suggestion: 'Nudge the author or reassign to keep the change moving.',
      })
    }

    const blockers = prFindings.filter(f => ['pr-conflict', 'pr-ci-failing', 'pr-changes-requested'].includes(f.id))
    const warnings = prFindings.filter(f => f.severity === 'warning')
    const verdict: GhPrVerdict =
      blockers.length > 0 ? 'changes-requested' : warnings.length > 0 ? 'needs-attention' : 'approved'

    for (const f of prFindings) {
      findings.push({ ...f, pr: r.number })
    }

    prs.push({
      number: r.number,
      title: r.title || `PR #${r.number}`,
      author,
      createdAt: r.createdAt ?? new Date(createdAt).toISOString(),
      updatedAt: r.updatedAt ?? new Date(updatedAt).toISOString(),
      ageDays,
      additions,
      deletions,
      sizeLines,
      isDraft: r.isDraft ?? false,
      reviewDecision,
      mergeable,
      ciState: ci.state,
      ciFailures: ci.failures,
      verdict,
    })
  }

  // Order: blockers first, then attention, then healthy — oldest first within each.
  const rank: Record<GhPrVerdict, number> = { 'changes-requested': 0, 'needs-attention': 1, approved: 2 }
  prs.sort((a, b) => rank[a.verdict] - rank[b.verdict] || b.ageDays - a.ageDays)

  const healthy = prs.filter(p => p.verdict === 'approved').length
  const attention = prs.filter(p => p.verdict === 'needs-attention').length
  const blockers = prs.filter(p => p.verdict === 'changes-requested').length
  const total = prs.length
  const summary: GhPrSummary = {
    total,
    healthy,
    attention,
    blockers,
    avgAgeDays: total > 0 ? Math.round(prs.reduce((s, p) => s + p.ageDays, 0) / total) : 0,
    oldestDays: total > 0 ? prs[0].ageDays : 0,
  }

  const verdict: GhPrVerdict = blockers > 0 ? 'changes-requested' : attention > 0 ? 'needs-attention' : total === 0 ? 'approved' : 'approved'
  return { prs, findings, summary, verdict }
}

/** Run one gh-pr pass over the repo. */
export function runGhPr(root: string, options: GhPrRunOptions = {}): GhPrReport {
  const scannedAt = Date.now()
  const maxPrs = options.maxPrs ?? 50

  if (options.file) {
    const raw = loadPrExport(options.file)
    if (raw !== null) {
      return { scannedAt, root, source: 'export-file', ...analyzePrs(raw) }
    }
    return {
      scannedAt,
      root,
      source: 'none',
      prs: [],
      findings: [{
        id: 'file-unreadable',
        severity: 'warning',
        pr: 0,
        message: `Could not read PR export at ${options.file} — the file must contain a gh pr list --json array.`,
        suggestion: 'Run `gh pr list --state open --json number,title,author,createdAt,updatedAt,additions,deletions,isDraft,reviewDecision,statusCheckRollup,mergeable` and save the output to the file.',
      }],
      summary: { total: 0, healthy: 0, attention: 0, blockers: 0, avgAgeDays: 0, oldestDays: 0 },
      verdict: 'changes-requested',
    }
  }

  const raw = fetchGhPrs(root, maxPrs)
  if (raw !== null) {
    return { scannedAt, root, source: 'gh-cli', ...analyzePrs(raw) }
  }

  return {
    scannedAt,
    root,
    source: 'none',
    prs: [],
    findings: [{
      id: 'no-data',
      severity: 'warning',
      pr: 0,
      message: 'No PR data available — the gh CLI is missing, unauthenticated, or this is not a GitHub repo.',
      suggestion: 'Install and auth the GitHub CLI (`gh auth login`) in a GitHub repo, or pass `--file <export.json>` with the output of `gh pr list --json`.',
    }],
    summary: { total: 0, healthy: 0, attention: 0, blockers: 0, avgAgeDays: 0, oldestDays: 0 },
    verdict: 'changes-requested',
  }
}

/** Render the triage report as markdown. */
export function renderGhPrMarkdown(report: GhPrReport): string {
  const lines = ['# vectalon gh-pr — GitHub PR Triage', '']
  lines.push(`Source: ${report.source}  ·  PRs: ${report.summary.total}  ·  Verdict: **${report.verdict}**`, '')
  lines.push(
    `| # | PR | Author | Age | Size | Review | CI | Mergeable | Verdict |`,
    '|---|---|---|---|---|---|---|---|---|',
  )
  for (const p of report.prs) {
    lines.push(
      `| ${p.number} | ${p.title.replace(/\|/g, '/')} | ${p.author} | ${p.ageDays}d | ${p.sizeLines} | ${p.reviewDecision ?? '—'} | ${p.ciState}${p.ciFailures.length ? ' (' + p.ciFailures.join(', ') + ')' : ''} | ${p.mergeable ?? '—'} | ${p.verdict} |`,
    )
  }
  lines.push('', '## Findings', '')
  for (const f of report.findings) {
    const mark = f.severity === 'warning' ? 'WARN' : 'INFO'
    lines.push(`### [${mark}] ${f.id} (PR #${f.pr})`, '', f.message, '', `**Suggestion**: ${f.suggestion}`, '')
  }
  return lines.join('\n')
}

/** Write the markdown + JSON report. */
export function writeGhPrReport(root: string, report: GhPrReport): { mdPath: string; jsonPath: string } {
  const dir = ghPrDocsDir(root)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const mdPath = join(dir, 'report.md')
  const jsonPath = join(dir, 'report.json')
  writeFileSync(mdPath, renderGhPrMarkdown(report), 'utf-8')
  writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf-8')
  return { mdPath, jsonPath }
}
