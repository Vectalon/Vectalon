/**
 * vectalon monitor — Observability Dashboard Agent (Roadmap Phase 11,
 * item 094) — Business Source License 1.1 (BSL-1.1)
 *
 * Aggregates the telemetry surfaces (sentry crash classes, observability
 * instrumentation + slow traces, crash reports, raw .vectalon/telemetry
 * events) into one executive view, alongside the engineering dashboard's
 * overall verdict. Reports to docs/vectalon/monitor/ (gitignored).
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { MonitorReport, MonitorSurface, MonitorVerdict } from './types'

export type { MonitorReport, MonitorSurface, MonitorVerdict } from './types'

/** Where monitor reports are written. */
export const monitorDocsDir = (root: string): string => join(root, 'docs', 'vectalon', 'monitor')

interface ReportLike {
  verdict?: string
  classes?: unknown[] | number
  crashClasses?: unknown[] | number
  total?: number
  findings?: unknown[]
}

const readReport = (root: string, rel: string): ReportLike | null => {
  try {
    if (!existsSync(join(root, rel))) return null
    return JSON.parse(readFileSync(join(root, rel), 'utf-8')) as ReportLike
  } catch {
    return null
  }
}

const count = (v: unknown[] | number | undefined): number => (typeof v === 'number' ? v : Array.isArray(v) ? v.length : 0)

/** Run one monitor pass over the telemetry surfaces. */
export function runMonitor(root: string): MonitorReport {
  const scannedAt = Date.now()
  const surfaces: MonitorSurface[] = []
  const findings: MonitorReport['findings'] = []

  const sentry = readReport(root, 'docs/vectalon/sentry/report.json')
  const sentryClasses = count(sentry?.crashClasses) || count(sentry?.classes)
  surfaces.push({
    id: 'sentry',
    label: 'Crash classes (Sentry)',
    verdict: sentry?.verdict ?? 'no-data',
    summary: sentry ? `${sentryClasses} crash class(es) ranked` : 'No sentry report yet',
    present: !!sentry,
  })

  const observability = readReport(root, 'docs/vectalon/observability/report.json')
  const obsFindings = Array.isArray(observability?.findings) ? observability.findings.length : 0
  surfaces.push({
    id: 'observability',
    label: 'Observability audit',
    verdict: observability?.verdict ?? 'no-data',
    summary: observability ? `${obsFindings} instrumentation/trace finding(s)` : 'No observability report yet',
    present: !!observability,
  })

  const crash = readReport(root, 'docs/vectalon/crash/report.json')
  surfaces.push({
    id: 'crash',
    label: 'Crash intelligence',
    verdict: crash?.verdict ?? 'no-data',
    summary: crash ? `Root cause: ${String((crash as { finding?: { bucket?: string } }).finding?.bucket ?? 'unknown')}` : 'No crash report yet',
    present: !!crash,
  })

  const dashboard = readReport(root, 'docs/vectalon/dashboard/report.json')
  surfaces.push({
    id: 'dashboard',
    label: 'Engineering dashboard',
    verdict: dashboard?.verdict ?? 'no-data',
    summary: dashboard ? `Overall: ${dashboard.verdict}` : 'No dashboard report yet',
    present: !!dashboard,
  })

  // Raw telemetry events under .vectalon/telemetry.
  let telemetryEvents = 0
  try {
    const base = join(root, '.vectalon', 'telemetry')
    if (existsSync(base)) {
      for (const f of readdirSync(base)) {
        const p = join(base, f)
        if (f.endsWith('.jsonl')) {
          try {
            telemetryEvents += readFileSync(p, 'utf-8').split('\n').filter(l => l.trim()).length
          } catch { /* skip */ }
        }
      }
    }
  } catch { /* no telemetry dir */ }

  if (sentry && sentryClasses === 0) {
    findings.push({
      id: 'no-crash-classes',
      severity: 'info',
      message: 'The sentry report shows no crash classes.',
      suggestion: 'Confirm telemetry ingestion is configured and exports are current.',
    })
  }
  if (!observability && !sentry) {
    findings.push({
      id: 'telemetry-missing',
      severity: 'warning',
      message: 'No sentry or observability reports exist — telemetry surfaces are not covered.',
      suggestion: 'Run vectalon sentry and vectalon observability after ingesting exports under .vectalon/telemetry.',
    })
  }

  const failing = surfaces.filter(s => s.verdict === 'changes-requested' || s.verdict === 'needs-attention')
  const verdict: MonitorVerdict = failing.some(s => s.verdict === 'changes-requested') ? 'changes-requested' : failing.length > 0 ? 'needs-attention' : 'approved'
  return { scannedAt, root, surfaces, crashClasses: sentryClasses, telemetryEvents, findings, verdict }
}

/** Render the monitor report as markdown. */
export function renderMonitorMarkdown(report: MonitorReport): string {
  const lines = ['# vectalon monitor — Observability Dashboard', '']
  lines.push(
    `Crash classes: ${report.crashClasses}  ·  Telemetry events: ${report.telemetryEvents}  ·  Verdict: **${report.verdict}**`,
    '',
    '| Surface | Verdict | Summary |',
    '|---|---|---|',
  )
  for (const s of report.surfaces) lines.push(`| ${s.label} | ${s.verdict} | ${s.summary} |`)
  lines.push('', '## Findings', '')
  for (const f of report.findings) {
    const mark = f.severity === 'warning' ? 'WARN' : 'INFO'
    lines.push(`### [${mark}] ${f.id}`, '', f.message, '', `**Suggestion**: ${f.suggestion}`, '')
  }
  return lines.join('\n')
}

/** Write the markdown + JSON report. */
export function writeMonitorReport(root: string, report: MonitorReport): { mdPath: string; jsonPath: string } {
  const dir = monitorDocsDir(root)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const mdPath = join(dir, 'report.md')
  const jsonPath = join(dir, 'report.json')
  writeFileSync(mdPath, renderMonitorMarkdown(report), 'utf-8')
  writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf-8')
  return { mdPath, jsonPath }
}
