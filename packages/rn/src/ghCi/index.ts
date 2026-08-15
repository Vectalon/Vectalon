/**
 * vectalon gh-ci — GitHub Workflow Reliability Agent (Roadmap Phase 11,
 * item 092) — Business Source License 1.1 (BSL-1.1)
 *
 * Reads `gh run list` (or a --file export) and scores each workflow for
 * reliability: failure rate, flakiness (the same workflow passing and
 * failing across its runs), and average duration. Reports to
 * docs/vectalon/gh-ci/ (gitignored).
 */

import { execFileSync } from 'child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { GhCiFinding, GhCiReport, GhCiSummary, GhCiVerdict, GhCiWorkflow } from './types'

export type { GhCiFinding, GhCiReport, GhCiSummary, GhCiVerdict, GhCiWorkflow } from './types'

/** Where gh-ci reports are written. */
export const ghCiDocsDir = (root: string): string => join(root, 'docs', 'vectalon', 'gh-ci')

export interface GhCiRunRaw {
  databaseId?: number
  displayTitle?: string
  workflowName?: string | null
  conclusion?: string | null
  status?: string | null
  createdAt?: string
  updatedAt?: string
  event?: string | null
  headBranch?: string | null
}

const FAILED = new Set(['FAILURE', 'ERROR', 'TIMED_OUT', 'CANCELLED', 'ACTION_REQUIRED', 'STARTUP_FAILURE', 'STALE'])
const FLAKE_RUNS = 5
const FLAKE_RATE = 0.2
const FAIL_RATE_WARN = 0.15
const SLOW_SEC = 1800

/** Run `gh run list` and return raw records (null when unavailable). */
export function fetchGhRuns(root: string, limit = 100): GhCiRunRaw[] | null {
  const fields = 'databaseId,displayTitle,workflowName,conclusion,status,createdAt,updatedAt,event,headBranch'
  try {
    const out = execFileSync('gh', ['run', 'list', '--limit', String(limit), '--json', fields], {
      cwd: root,
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 20_000,
    }).toString()
    const parsed = JSON.parse(out) as GhCiRunRaw[]
    return Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

/** Read a `gh run list --json` export file. */
export function loadRunExport(file: string): GhCiRunRaw[] | null {
  try {
    if (!existsSync(file)) return null
    const parsed = JSON.parse(readFileSync(file, 'utf-8')) as GhCiRunRaw[]
    return Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

/** Compute per-workflow reliability from raw runs. */
export function analyzeRuns(raw: GhCiRunRaw[]): Omit<GhCiReport, 'scannedAt' | 'root' | 'source'> {
  const byWorkflow = new Map<string, GhCiRunRaw[]>()
  for (const run of raw) {
    const name = run.workflowName || '(unknown workflow)'
    if (!byWorkflow.has(name)) byWorkflow.set(name, [])
    byWorkflow.get(name)!.push(run)
  }

  const workflows: GhCiWorkflow[] = []
  const findings: GhCiFinding[] = []
  let totalRuns = 0
  let totalDuration = 0

  for (const [name, runs] of byWorkflow) {
    const completed = runs.filter(r => r.status === 'COMPLETED')
    const passed = completed.filter(r => !FAILED.has(r.conclusion ?? '')).length
    const failed = completed.length - passed
    const failureRate = completed.length > 0 ? failed / completed.length : 0
    const durations = runs
      .map(r => (r.createdAt && r.updatedAt ? (new Date(r.updatedAt).getTime() - new Date(r.createdAt).getTime()) / 1000 : NaN))
      .filter(n => !Number.isNaN(n) && n > 0)
    const avgDurationSec = durations.length > 0 ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0

    // Flaky = the workflow both passes and fails across >= FLAKE_RUNS completed runs.
    const flaky = completed.length >= FLAKE_RUNS && passed > 0 && failed > 0 && failureRate >= FLAKE_RATE

    workflows.push({ name, runs: completed.length, passed, failed, flakeCount: flaky ? failed : 0, avgDurationSec, failureRate, flaky })
    totalRuns += completed.length
    totalDuration += avgDurationSec * completed.length

    const local: Array<{ id: string; severity: 'warning' | 'info'; message: string; suggestion: string }> = []
    if (flaky) {
      local.push({
        id: 'workflow-flaky',
        severity: 'warning',
        message: `"${name}" fails ${(failureRate * 100).toFixed(0)}% of runs — it is flaky, so red CI no longer means a real break.`,
        suggestion: 'Isolate the flaky job, add retries with backoff, or quarantine the test that flips.',
      })
    } else if (failureRate >= FAIL_RATE_WARN && completed.length >= 3) {
      local.push({
        id: 'workflow-failing',
        severity: 'warning',
        message: `"${name}" fails ${(failureRate * 100).toFixed(0)}% of the last ${completed.length} runs.`,
        suggestion: 'Treat red as a real break — fix the failing job before merging anything on top.',
      })
    }
    if (avgDurationSec > SLOW_SEC && runs.length >= 3) {
      local.push({
        id: 'workflow-slow',
        severity: 'info',
        message: `"${name}" averages ${Math.round(avgDurationSec / 60)}min per run — slow CI taxes every merge.`,
        suggestion: 'Split the workflow, parallelize jobs, cache dependencies, or shard the test matrix.',
      })
    }
    for (const f of local) findings.push({ ...f, workflow: name })
  }

  workflows.sort((a, b) => b.failureRate - a.failureRate || b.runs - a.runs)
  const failingWorkflows = workflows.filter(w => w.failureRate >= FAIL_RATE_WARN && w.runs >= 3).length
  const flakyWorkflows = workflows.filter(w => w.flaky).length
  const summary: GhCiSummary = {
    workflows: workflows.length,
    runs: totalRuns,
    failingWorkflows,
    flakyWorkflows,
    avgDurationSec: totalRuns > 0 ? Math.round(totalDuration / totalRuns) : 0,
  }

  if (summary.workflows === 0) {
    findings.push({
      id: 'no-runs', severity: 'info', workflow: '(all)',
      message: 'No completed workflow runs in the provided history.',
      suggestion: 'Widen the run window or confirm CI is triggered on this branch.',
    })
  }

  const verdict: GhCiVerdict = flakyWorkflows > 0 || failingWorkflows > 0 ? 'needs-attention' : 'approved'
  return { workflows, findings, summary, verdict }
}

/** Run one gh-ci pass. */
export function runGhCi(root: string, options: { file?: string; limit?: number } = {}): GhCiReport {
  const scannedAt = Date.now()
  if (options.file) {
    const raw = loadRunExport(options.file)
    if (raw !== null) return { scannedAt, root, source: 'export-file', ...analyzeRuns(raw) }
    return {
      scannedAt, root, source: 'none', workflows: [], findings: [{
        id: 'file-unreadable', severity: 'warning', workflow: '(all)',
        message: `Could not read run export at ${options.file}.`,
        suggestion: 'The file must contain a gh run list --json array.',
      }], summary: { workflows: 0, runs: 0, failingWorkflows: 0, flakyWorkflows: 0, avgDurationSec: 0 }, verdict: 'changes-requested',
    }
  }
  const raw = fetchGhRuns(root, options.limit ?? 100)
  if (raw !== null) return { scannedAt, root, source: 'gh-cli', ...analyzeRuns(raw) }
  return {
    scannedAt, root, source: 'none', workflows: [], findings: [{
      id: 'no-data', severity: 'warning', workflow: '(all)',
      message: 'No workflow-run data available — gh is missing, unauthenticated, or this is not a GitHub repo.',
      suggestion: 'Install and auth the GitHub CLI, or pass --file with a gh run list --json export.',
    }], summary: { workflows: 0, runs: 0, failingWorkflows: 0, flakyWorkflows: 0, avgDurationSec: 0 }, verdict: 'changes-requested',
  }
}

/** Render the reliability report as markdown. */
export function renderGhCiMarkdown(report: GhCiReport): string {
  const lines = ['# vectalon gh-ci — GitHub Workflow Reliability', '']
  const s = report.summary
  lines.push(`Source: ${report.source}  ·  Workflows: ${s.workflows}  ·  Runs: ${s.runs}  ·  Flaky: ${s.flakyWorkflows}  ·  Verdict: **${report.verdict}**`, '')
  lines.push('| Workflow | Runs | Pass | Fail | Fail rate | Flaky | Avg |', '|---|---|---|---|---|---|---|')
  for (const w of report.workflows) {
    lines.push(`| ${w.name.replace(/\|/g, '/')} | ${w.runs} | ${w.passed} | ${w.failed} | ${(w.failureRate * 100).toFixed(0)}% | ${w.flaky ? 'yes' : 'no'} | ${Math.round(w.avgDurationSec / 60)}m |`)
  }
  lines.push('', '## Findings', '')
  for (const f of report.findings) {
    const mark = f.severity === 'warning' ? 'WARN' : 'INFO'
    lines.push(`### [${mark}] ${f.id} (${f.workflow})`, '', f.message, '', `**Suggestion**: ${f.suggestion}`, '')
  }
  return lines.join('\n')
}

/** Write the markdown + JSON report. */
export function writeGhCiReport(root: string, report: GhCiReport): { mdPath: string; jsonPath: string } {
  const dir = ghCiDocsDir(root)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const mdPath = join(dir, 'report.md')
  const jsonPath = join(dir, 'report.json')
  writeFileSync(mdPath, renderGhCiMarkdown(report), 'utf-8')
  writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf-8')
  return { mdPath, jsonPath }
}
