/**
 * vectalon sentry — Sentry Intelligence Agent (Roadmap Phase 10, item 081)
 * Business Source License 1.1 (BSL-1.1)
 *
 * One deterministic pass over the telemetry directory: parse every Sentry /
 * Crashlytics export, group crashes into classes, rank by volume, and attach
 * a RootCauseAnalyzer verdict per class. Reports to docs/vectalon/sentry/
 * (gitignored).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join, relative } from 'path'
import { RootCauseAnalyzer } from '../sdlc/RootCauseAnalyzer'
import { parseTelemetryContent, scanTelemetryFiles } from '../knowledge/telemetry'
import type { ParsedCrash } from '../knowledge/telemetry'
import type { SentryCrashClass, SentryFinding, SentryReport } from './types'

export type { SentryCrashClass, SentryFinding, SentryReport } from './types'

/** Where sentry reports are written. */
export const sentryDocsDir = (root: string): string => join(root, 'docs', 'vectalon', 'sentry')

/** Default telemetry directory (same convention as the telemetry watcher). */
export const TELEMETRY_DIRS = ['.vectalon/telemetry', 'telemetry']

/** Resolve the telemetry directory that exists, else the first candidate. */
export function findTelemetryDir(root: string): string | null {
  for (const dir of TELEMETRY_DIRS) {
    if (existsSync(join(root, dir))) return join(root, dir)
  }
  return null
}

/** Group parsed crashes into classes by exception type / message / id. */
export function groupCrashes(crashes: ParsedCrash[]): SentryCrashClass[] {
  const analyzer = new RootCauseAnalyzer()
  const byKey = new Map<string, { crashes: ParsedCrash[]; key: string }>()
  for (const crash of crashes) {
    const key = crash.exceptionType || crash.message || crash.id
    const group = byKey.get(key)
    if (group) {
      group.crashes.push(crash)
    } else {
      byKey.set(key, { crashes: [crash], key })
    }
  }

  const classes: SentryCrashClass[] = []
  for (const { crashes, key } of byKey.values()) {
    const first = crashes[0]
    const result = analyzer.analyzeCrash(first)
    const releases = [...new Set(crashes.map(c => c.release).filter((r): r is string => !!r))]
    const userIds = new Set(crashes.map(c => c.user?.id).filter((id): id is string => !!id))
    const timestamps = crashes.map(c => c.timestamp).filter((t): t is number => !!t)
    const severity: SentryCrashClass['severity'] =
      crashes.length >= 5 || userIds.size >= 5 ? 'critical'
      : crashes.length >= 2 ? 'warning'
      : 'info'
    classes.push({
      key,
      exceptionType: first.exceptionType,
      message: first.message,
      releases,
      eventCount: crashes.length,
      userCount: userIds.size,
      bucket: result.bucket,
      probableCause: result.probableCause,
      investigation: result.investigation,
      firstSeen: timestamps.length > 0 ? Math.min(...timestamps) : undefined,
      lastSeen: timestamps.length > 0 ? Math.max(...timestamps) : undefined,
      severity,
    })
  }
  // Highest severity + volume first.
  const rank = (c: SentryCrashClass): number => (c.severity === 'critical' ? 0 : c.severity === 'warning' ? 1 : 2)
  return classes.sort((a, b) => rank(a) - rank(b) || b.eventCount - a.eventCount)
}

/** Detect release regression: a class whose latest release differs from prior ones. */
export function findRegressions(classes: SentryCrashClass[]): SentryFinding[] {
  const findings: SentryFinding[] = []
  for (const c of classes) {
    if (c.releases.length >= 2 && c.severity !== 'info') {
      const latest = c.releases[c.releases.length - 1]
      const prior = c.releases.slice(0, -1)
      if (!prior.includes(latest)) {
        findings.push({
          id: 'regression', severity: c.severity === 'critical' ? 'critical' : 'warning', key: c.key,
          message: `Crash class "${c.key}" (${c.eventCount} events) is attributed to new release ${latest}, not seen in earlier releases (${prior.join(', ')})`,
          suggestion: 'Diff the code paths touched between the two releases and ship a hotfix or revert before rolling out wider.',
        })
      }
    }
  }
  return findings
}

/** Run the sentry intelligence pass. */
export function runSentryScan(root: string): SentryReport {
  const scannedAt = Date.now()
  const dir = findTelemetryDir(root)
  const findings: SentryFinding[] = []
  let crashClasses: SentryCrashClass[] = []
  let filesScanned = 0
  let events = 0

  if (!dir) {
    findings.push({
      id: 'no-telemetry', severity: 'info',
      message: 'No telemetry directory found (.vectalon/telemetry or telemetry).',
      suggestion: 'Export Sentry/Crashlytics events as JSON/JSONL into .vectalon/telemetry/ so this agent can rank crash classes.',
    })
  } else {
    const crashes: ParsedCrash[] = []
    for (const file of scanTelemetryFiles(dir)) {
      filesScanned++
      let content = ''
      try {
        content = readFileSync(file, 'utf-8')
      } catch {
        continue
      }
      for (const event of parseTelemetryContent(content)) {
        events++
        if (event.kind === 'crash') crashes.push(event)
      }
    }
    crashClasses = groupCrashes(crashes)
    findings.push(...findRegressions(crashClasses))
    if (crashes.length === 0) {
      findings.push({
        id: 'no-telemetry', severity: 'info',
        message: 'No crash events found in the telemetry exports.',
        suggestion: 'Verify Sentry/Crashlytics is wired to export events into the telemetry directory.',
      })
    }
  }

  const bySeverity: Record<string, number> = {}
  for (const f of findings) bySeverity[f.severity] = (bySeverity[f.severity] ?? 0) + 1
  const verdict: SentryReport['verdict'] =
    findings.some(f => f.severity === 'critical') ? 'changes-requested'
    : findings.some(f => f.severity === 'warning') ? 'needs-attention'
    : 'approved'
  return { scannedAt, root, filesScanned, events, crashClasses, findings, verdict, summary: { total: findings.length, bySeverity } }
}

/** Render the sentry report as markdown. */
export function renderSentryMarkdown(report: SentryReport): string {
  const lines = ['# vectalon sentry — Sentry Intelligence', '']
  lines.push(`Telemetry files: ${report.filesScanned}  ·  Events: ${report.events}  ·  Crash classes: ${report.crashClasses.length}  ·  Verdict: **${report.verdict}**`, '')
  if (report.crashClasses.length === 0) lines.push('', 'No crash classes to rank.', '')
  for (const c of report.crashClasses) {
    lines.push(`### [${c.severity.toUpperCase()}] ${c.key}`, '')
    lines.push(`Events: ${c.eventCount}  ·  Users: ${c.userCount}  ·  Releases: ${c.releases.join(', ') || 'unknown'}`, '')
    if (c.firstSeen && c.lastSeen) lines.push(`Window: ${new Date(c.firstSeen).toISOString()} → ${new Date(c.lastSeen).toISOString()}`, '')
    lines.push('', `Bucket: ${c.bucket}`, '', `Probable cause: ${c.probableCause}`, '', 'Investigation:', ...c.investigation.map(s => `- ${s}`), '')
  }
  if (report.findings.length > 0) {
    lines.push('## Findings', '')
    for (const f of report.findings) {
      const mark = f.severity === 'critical' ? 'CRIT' : f.severity === 'warning' ? 'WARN' : 'INFO'
      lines.push(`### [${mark}] ${f.id}${f.key ? ` — ${f.key}` : ''}`, '', f.message, '', `**Fix**: ${f.suggestion}`, '')
    }
  }
  return lines.join('\n')
}

/** Write the markdown + JSON report. */
export function writeSentryReport(root: string, report: SentryReport): { mdPath: string; jsonPath: string } {
  const dir = sentryDocsDir(root)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const mdPath = join(dir, 'report.md')
  const jsonPath = join(dir, 'report.json')
  writeFileSync(mdPath, renderSentryMarkdown(report), 'utf-8')
  writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf-8')
  return { mdPath, jsonPath }
}

/** Report path helpers shared with the CLI (relative to root). */
export function sentryReportPaths(root: string): { md: string; json: string } {
  const dir = sentryDocsDir(root)
  return { md: relative(root, join(dir, 'report.md')), json: relative(root, join(dir, 'report.json')) }
}
