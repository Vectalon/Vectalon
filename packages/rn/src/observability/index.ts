/**
 * vectalon observability — Mobile Observability Agent (Roadmap Phase 10, item 082)
 * Business Source License 1.1 (BSL-1.1)
 *
 * Two deterministic passes: (1) scan source for instrumentation coverage —
 * Sentry/Crashlytics init, crash handlers, analytics SDK, network
 * breadcrumbs — and flag what's missing; (2) parse telemetry traces and flag
 * slow spans (above a threshold) and un-named spans. Reports to
 * docs/vectalon/observability/ (gitignored).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join, relative } from 'path'
import { walkProjectFiles } from '../upgrade/scan'
import { parseTelemetryContent, scanTelemetryFiles } from '../knowledge/telemetry'
import type { ParsedTrace } from '../knowledge/telemetry'
import type { ObsFinding, ObsReport, ObsSlowTrace } from './types'

export type { ObsFinding, ObsReport, ObsSlowTrace } from './types'

/** Where observability reports are written. */
export const obsDocsDir = (root: string): string => join(root, 'docs', 'vectalon', 'observability')

export const SLOW_TRACE_THRESHOLD_MS = 1000
export const SLOW_SPAN_THRESHOLD_MS = 500

/** Source patterns indicating instrumentation presence. */
const INSTRUMENTATION_PATTERNS: Array<{ id: ObsFinding['id']; label: string; patterns: RegExp[] }> = [
  {
    id: 'no-sentry-init', label: 'Sentry init',
    patterns: [/Sentry\.init\(/, /initSentry|setupSentry/, /@sentry\/react-native/],
  },
  {
    id: 'no-crash-handler', label: 'Crash handler',
    patterns: [/ErrorUtils\.setGlobalHandler/, /globalErrorHandler|handleGlobalError/, /crashlytics\(\)\.recordError|recordError\(/, /setOnUncaughtException/],
  },
  {
    id: 'no-analytics-sdk', label: 'Analytics SDK',
    patterns: [/firebase\.analytics|analytics\(\)/, /@react-native-firebase\/analytics/, /logEvent\(/, /amplitude|mixpanel|segment/],
  },
  {
    id: 'no-network-breadcrumb', label: 'Network breadcrumbs',
    patterns: [/breadcrumb|addBreadcrumb/, /networkBreadcrumbs|httpClientIntegration/],
  },
  {
    id: 'no-performance-tracing', label: 'Performance tracing',
    patterns: [/startTransaction|startSpan|trace\.start|performance\.trace|Sentry\.startTransaction/, /withProfiling/],
  },
]

/** Scan source files for instrumentation coverage. */
export function scanInstrumentation(root: string): ObsFinding[] {
  const findings: ObsFinding[] = []
  const sourceFiles = walkProjectFiles(root)
  const seen = new Set<ObsFinding['id']>()
  for (const file of sourceFiles) {
    if (!/\.(ts|tsx|js|jsx|swift|kt|java|m|mm)$/.test(file)) continue
    let content = ''
    try {
      content = readFileSync(join(root, file), 'utf-8')
    } catch {
      continue
    }
    for (const item of INSTRUMENTATION_PATTERNS) {
      if (seen.has(item.id)) continue
      if (item.patterns.some(p => p.test(content))) {
        seen.add(item.id)
      }
    }
    if (seen.size === INSTRUMENTATION_PATTERNS.length) break
  }
  for (const item of INSTRUMENTATION_PATTERNS) {
    if (!seen.has(item.id)) {
      findings.push({
        id: item.id, severity: 'warning',
        file: undefined, line: undefined,
        message: `${item.label} not detected in any source file`,
        suggestion: `Wire up ${item.label.toLowerCase()} so crashes and performance data actually reach your observability backend.`,
      })
    }
  }
  return findings
}

/** Parse telemetry traces and flag slow ones. */
export function scanTraces(root: string): { traces: ParsedTrace[]; slow: ObsSlowTrace[] } {
  const traces: ParsedTrace[] = []
  const slow: ObsSlowTrace[] = []
  const dirs = [join(root, '.vectalon', 'telemetry'), join(root, 'telemetry')]
  for (const dir of dirs) {
    if (!existsSync(dir)) continue
    for (const file of scanTelemetryFiles(dir)) {
      let content = ''
      try {
        content = readFileSync(file, 'utf-8')
      } catch {
        continue
      }
      for (const event of parseTelemetryContent(content)) {
        if (event.kind !== 'performance') continue
        traces.push(event)
        if (event.durationMs >= SLOW_TRACE_THRESHOLD_MS) {
          const spans = (event.spans ?? [])
            .filter(s => s.durationMs >= SLOW_SPAN_THRESHOLD_MS)
            .map(s => ({ op: s.op ?? 'unknown', description: s.description, durationMs: s.durationMs }))
          slow.push({ name: event.name, durationMs: event.durationMs, spans, release: event.release })
        }
      }
    }
  }
  slow.sort((a, b) => b.durationMs - a.durationMs)
  return { traces, slow }
}

/** Run the observability pass. */
export function runObsScan(root: string): ObsReport {
  const scannedAt = Date.now()
  const findings = scanInstrumentation(root)
  const { traces, slow } = scanTraces(root)
  const bySeverity: Record<string, number> = {}
  for (const f of findings) bySeverity[f.severity] = (bySeverity[f.severity] ?? 0) + 1
  for (const s of slow) {
    if (s.durationMs >= SLOW_TRACE_THRESHOLD_MS * 5) {
      const f: ObsFinding = {
        id: 'slow-trace', severity: 'warning',
        file: undefined, line: undefined,
        message: `Trace "${s.name}" took ${s.durationMs} ms (>= ${SLOW_TRACE_THRESHOLD_MS * 5} ms)`,
        suggestion: 'Profile the trace with a CPU profile and move the hot path off the main thread or defer it.',
      }
      findings.push(f)
      bySeverity[f.severity] = (bySeverity[f.severity] ?? 0) + 1
    }
  }
  const verdict: ObsReport['verdict'] =
    findings.some(f => f.severity === 'warning') ? 'needs-attention' : 'approved'
  return { scannedAt, root, tracesScanned: traces.length, slowTraces: slow, findings, verdict, summary: { total: findings.length, bySeverity } }
}

/** Render the observability report as markdown. */
export function renderObsMarkdown(report: ObsReport): string {
  const lines = ['# vectalon observability — Mobile Observability', '']
  lines.push(`Traces scanned: ${report.tracesScanned}  ·  Slow traces: ${report.slowTraces.length}  ·  Verdict: **${report.verdict}**`, '')
  if (report.findings.length === 0) lines.push('', 'No instrumentation or performance findings.', '')
  for (const f of report.findings) {
    const mark = f.severity === 'warning' ? 'WARN' : 'INFO'
    lines.push(`### [${mark}] ${f.id}`, '', f.message, '', `**Fix**: ${f.suggestion}`, '')
  }
  if (report.slowTraces.length > 0) {
    lines.push('## Slow traces', '')
    for (const s of report.slowTraces.slice(0, 20)) {
      lines.push(`- **${s.name}** — ${s.durationMs} ms${s.release ? ` (${s.release})` : ''}`)
      for (const span of s.spans.slice(0, 5)) {
        lines.push(`  - ${span.op}${span.description ? ` "${span.description}"` : ''} — ${span.durationMs} ms`)
      }
    }
  }
  return lines.join('\n')
}

/** Write the markdown + JSON report. */
export function writeObsReport(root: string, report: ObsReport): { mdPath: string; jsonPath: string } {
  const dir = obsDocsDir(root)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const mdPath = join(dir, 'report.md')
  const jsonPath = join(dir, 'report.json')
  writeFileSync(mdPath, renderObsMarkdown(report), 'utf-8')
  writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf-8')
  return { mdPath, jsonPath }
}

/** Report path helpers shared with the CLI. */
export function obsReportPaths(root: string): { md: string; json: string } {
  const dir = obsDocsDir(root)
  return { md: relative(root, join(dir, 'report.md')), json: relative(root, join(dir, 'report.json')) }
}
