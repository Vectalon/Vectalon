/**
 * vectalon gh-issue — GitHub Issue Intelligence Agent (Roadmap Phase 11,
 * item 091) — Business Source License 1.1 (BSL-1.1)
 *
 * Reads `gh issue list` (or a --file export) and produces a triage queue:
 * staleness, unassigned triage gaps, label hygiene, and velocity. When no
 * data is available it reports an explicit no-data verdict. Reports to
 * docs/vectalon/gh-issue/ (gitignored).
 */

import { execFileSync } from 'child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { GhIssueEntry, GhIssueFinding, GhIssueReport, GhIssueSummary, GhIssueVerdict } from './types'

export type { GhIssueEntry, GhIssueFinding, GhIssueReport, GhIssueSummary, GhIssueVerdict } from './types'

/** Where gh-issue reports are written. */
export const ghIssueDocsDir = (root: string): string => join(root, 'docs', 'vectalon', 'gh-issue')

export interface GhIssueRaw {
  number: number
  title?: string
  author?: { login?: string } | null
  createdAt?: string
  updatedAt?: string
  labels?: Array<{ name?: string }>
  assignees?: Array<{ login?: string }>
  url?: string
}

const STALE_DAYS = 30
const OLD_DAYS = 14
const TRIAGE_GAP_DAYS = 7

const days = (ms: number): number => Math.max(0, Math.round(ms / 86_400_000))

/** Run `gh issue list` and return the raw records (null when unavailable). */
export function fetchGhIssues(root: string, max = 100): GhIssueRaw[] | null {
  const fields = 'number,title,author,createdAt,updatedAt,labels,assignees,url'
  try {
    const out = execFileSync('gh', ['issue', 'list', '--state', 'open', '--limit', String(max), '--json', fields], {
      cwd: root,
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 20_000,
    }).toString()
    const parsed = JSON.parse(out) as GhIssueRaw[]
    return Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

/** Read a `gh issue list --json` export file. */
export function loadIssueExport(file: string): GhIssueRaw[] | null {
  try {
    if (!existsSync(file)) return null
    const parsed = JSON.parse(readFileSync(file, 'utf-8')) as GhIssueRaw[]
    return Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

/** Compute the triage report from raw records. */
export function analyzeIssues(raw: GhIssueRaw[], now = Date.now()): Omit<GhIssueReport, 'scannedAt' | 'root' | 'source'> {
  const issues: GhIssueEntry[] = []
  const findings: GhIssueFinding[] = []
  const labels = new Map<string, number>()

  for (const r of raw) {
    const createdAt = r.createdAt ? new Date(r.createdAt).getTime() : now
    const updatedAt = r.updatedAt ? new Date(r.updatedAt).getTime() : createdAt
    const ageDays = days(now - createdAt)
    const issueLabels = (r.labels ?? []).map(l => l.name ?? '').filter(Boolean)
    const issueAssignees = (r.assignees ?? []).map(a => a.login ?? '').filter(Boolean)
    const number = r.number
    const author = r.author?.login ?? 'unknown'

    for (const l of issueLabels) labels.set(l, (labels.get(l) ?? 0) + 1)

    const local: Array<{ id: string; severity: 'warning' | 'info'; message: string; suggestion: string }> = []

    if (ageDays > STALE_DAYS) {
      local.push({
        id: 'issue-stale',
        severity: 'warning',
        message: `Issue #${number} has been open ${ageDays} days with no resolution.`,
        suggestion: 'Close, re-scope, or assign an owner — an open issue without a plan is a background tax on every dev.',
      })
    } else if (ageDays >= OLD_DAYS) {
      local.push({
        id: 'issue-old',
        severity: 'info',
        message: `Issue #${number} has been open ${ageDays} days.`,
        suggestion: 'Confirm it is still relevant and triaged.',
      })
    }

    if (issueAssignees.length === 0 && ageDays >= TRIAGE_GAP_DAYS) {
      local.push({
        id: 'issue-unassigned',
        severity: 'warning',
        message: `Issue #${number} is unassigned after ${ageDays} days — nobody owns it.`,
        suggestion: 'Assign an owner or mark it as triage-needed so it stops rotating.',
      })
    }

    if (issueLabels.length === 0) {
      local.push({
        id: 'issue-unlabeled',
        severity: 'info',
        message: `Issue #${number} has no labels — it is invisible to filter views and kanban columns.`,
        suggestion: 'Add type/priority labels so the backlog can be filtered and routed.',
      })
    }

    const blockers = local.filter(f => f.id === 'issue-stale')
    const warnings = local.filter(f => f.severity === 'warning')
    const verdict: GhIssueVerdict = blockers.length > 0 ? 'changes-requested' : warnings.length > 0 ? 'needs-attention' : 'approved'

    for (const f of local) findings.push({ ...f, issue: number })
    issues.push({
      number,
      title: r.title ?? `Issue #${number}`,
      author,
      createdAt: r.createdAt ?? new Date(createdAt).toISOString(),
      updatedAt: r.updatedAt ?? new Date(updatedAt).toISOString(),
      ageDays,
      labels: issueLabels,
      assignees: issueAssignees,
      verdict,
    })
  }

  issues.sort((a, b) => {
    const rank: Record<GhIssueVerdict, number> = { 'changes-requested': 0, 'needs-attention': 1, approved: 2 }
    return rank[a.verdict] - rank[b.verdict] || b.ageDays - a.ageDays
  })

  const summary: GhIssueSummary = {
    total: issues.length,
    triaged: issues.filter(i => i.labels.length > 0 && i.assignees.length > 0).length,
    unassigned: issues.filter(i => i.assignees.length === 0).length,
    stale: issues.filter(i => i.ageDays > STALE_DAYS).length,
    oldestDays: issues.length > 0 ? issues[0].ageDays : 0,
  }

  // Label hygiene — low-cardinality labels that fragment the board.
  const topLabels = [...labels.entries()].sort((a, b) => b[1] - a[1])
  for (const [name, count] of topLabels.slice(0, 3)) {
    if (count === 1 && issues.length >= 10) {
      findings.push({
        id: 'label-fragmented',
        severity: 'info',
        issue: 0,
        message: `Label "${name}" appears on a single issue — it fragments the board.`,
        suggestion: 'Consolidate near-synonym labels into a small fixed set.',
      })
    }
  }
  if (issues.length >= 5 && topLabels.length === 0) {
    findings.push({
      id: 'labels-missing',
      severity: 'info',
      issue: 0,
      message: 'The backlog has no labels at all.',
      suggestion: 'Introduce type + priority labels for filtering and routing.',
    })
  }

  const verdict: GhIssueVerdict = summary.stale > 0 ? 'changes-requested' : summary.unassigned > summary.total * 0.3 ? 'needs-attention' : 'approved'
  return { issues, findings, summary, verdict }
}

/** Run one gh-issue pass. */
export function runGhIssue(root: string, options: { file?: string; max?: number } = {}): GhIssueReport {
  const scannedAt = Date.now()
  if (options.file) {
    const raw = loadIssueExport(options.file)
    if (raw !== null) return { scannedAt, root, source: 'export-file', ...analyzeIssues(raw) }
    return {
      scannedAt, root, source: 'none', issues: [], findings: [{
        id: 'file-unreadable', severity: 'warning', issue: 0,
        message: `Could not read issue export at ${options.file}.`,
        suggestion: 'The file must contain a gh issue list --json array.',
      }], summary: { total: 0, triaged: 0, unassigned: 0, stale: 0, oldestDays: 0 }, verdict: 'changes-requested',
    }
  }
  const raw = fetchGhIssues(root, options.max ?? 100)
  if (raw !== null) return { scannedAt, root, source: 'gh-cli', ...analyzeIssues(raw) }
  return {
    scannedAt, root, source: 'none', issues: [], findings: [{
      id: 'no-data', severity: 'warning', issue: 0,
      message: 'No issue data available — gh is missing, unauthenticated, or this is not a GitHub repo.',
      suggestion: 'Install and auth the GitHub CLI, or pass --file with a gh issue list --json export.',
    }], summary: { total: 0, triaged: 0, unassigned: 0, stale: 0, oldestDays: 0 }, verdict: 'changes-requested',
  }
}

/** Render the triage report as markdown. */
export function renderGhIssueMarkdown(report: GhIssueReport): string {
  const lines = ['# vectalon gh-issue — GitHub Issue Triage', '']
  const s = report.summary
  lines.push(`Source: ${report.source}  ·  Open: ${s.total}  ·  Stale: ${s.stale}  ·  Unassigned: ${s.unassigned}  ·  Verdict: **${report.verdict}**`, '')
  lines.push('| # | Title | Author | Age | Labels | Assignees | Verdict |', '|---|---|---|---|---|---|---|')
  for (const i of report.issues) {
    lines.push(`| ${i.number} | ${i.title.replace(/\|/g, '/')} | ${i.author} | ${i.ageDays}d | ${i.labels.join(', ') || '—'} | ${i.assignees.join(', ') || '—'} | ${i.verdict} |`)
  }
  lines.push('', '## Findings', '')
  for (const f of report.findings) {
    const mark = f.severity === 'warning' ? 'WARN' : 'INFO'
    lines.push(`### [${mark}] ${f.id}${f.issue ? ` (issue #${f.issue})` : ''}`, '', f.message, '', `**Suggestion**: ${f.suggestion}`, '')
  }
  return lines.join('\n')
}

/** Write the markdown + JSON report. */
export function writeGhIssueReport(root: string, report: GhIssueReport): { mdPath: string; jsonPath: string } {
  const dir = ghIssueDocsDir(root)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const mdPath = join(dir, 'report.md')
  const jsonPath = join(dir, 'report.json')
  writeFileSync(mdPath, renderGhIssueMarkdown(report), 'utf-8')
  writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf-8')
  return { mdPath, jsonPath }
}
