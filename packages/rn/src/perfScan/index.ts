/**
 * vectalon perf — static render-performance scan (Roadmap Phase 4,
 * items 021-023, 027, 029): re-render hazards, startup hot paths, and legacy
 * bridge traffic in one deterministic pass, with severity-ranked
 * recommendations. Reports to docs/vectalon/perf/ (gitignored).
 * Business Source License 1.1 (BSL-1.1)
 */
import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { reportError } from '../utils/safe'
import { walkProjectFiles } from '../upgrade/scan'
import { scanRenderHazards } from './render'
import { scanStartupHazards } from './startup'
import { scanBridgeHazards } from './bridge'
import type { PerfScanFinding, PerfScanReport, PerfScanSummary } from './types'

export type { PerfScanFinding, PerfScanReport, PerfScanSummary } from './types'

/** Where perf reports are written (mirrors other docs/vectalon/* dirs). */
export const perfDocsDir = (root: string): string => join(root, 'docs', 'vectalon', 'perf')

/** Run the whole static perf scan against a project root. */
export function runPerfScan(root: string): PerfScanReport {
  const started = Date.now()
  const files = walkProjectFiles(root)
  const findings: PerfScanFinding[] = []

  for (const file of files) {
    let content: string
    try {
      content = readFileSync(join(root, file), 'utf-8')
    } catch (err) {
      reportError(err, `perf: reading ${file}`)
      continue
    }
    if (/\.[tj]sx?$/.test(file)) {
      findings.push(...scanRenderHazards(content, file))
      findings.push(...scanStartupHazards(content, file))
      findings.push(...scanBridgeHazards(content, file))
    }
  }

  // 029 — the recommendation engine: severity-ranked, deduped suggestions.
  findings.sort((a, b) => severityRank(b.severity) - severityRank(a.severity))
  const summary = summarizePerfScan(findings)
  return {
    scannedAt: started,
    root,
    fileCount: files.length,
    findings,
    summary,
  }
}

function severityRank(sev: PerfScanFinding['severity']): number {
  return sev === 'error' ? 3 : sev === 'warning' ? 2 : 1
}

/** Roll findings into counts + top recommendations (Roadmap 029). */
export function summarizePerfScan(findings: PerfScanFinding[]): PerfScanSummary {
  const byCategory: PerfScanSummary['byCategory'] = { render: 0, startup: 0, bridge: 0 }
  const bySeverity: PerfScanSummary['bySeverity'] = { error: 0, warning: 0, info: 0 }
  for (const f of findings) {
    byCategory[f.category] = (byCategory[f.category] ?? 0) + 1
    bySeverity[f.severity] = (bySeverity[f.severity] ?? 0) + 1
  }
  // 029 — recommendations are severity-ranked regardless of scan order, so
  // the summary is meaningful even when called with unsorted findings.
  const ranked = [...findings].sort((a, b) => severityRank(b.severity) - severityRank(a.severity))
  const seen = new Set<string>()
  const topRecommendations: string[] = []
  for (const f of ranked) {
    const key = `${f.id}:${f.file}:${f.line}`
    if (seen.has(key)) continue
    seen.add(key)
    topRecommendations.push(`${f.suggestion} (${f.file}:${f.line})`)
    if (topRecommendations.length >= 3) break
  }
  return { total: findings.length, byCategory, bySeverity, topRecommendations }
}

/** Human-readable markdown report (mirrors diagnostics' renderer style). */
export function renderPerfMarkdown(report: PerfScanReport): string {
  const lines: string[] = []
  lines.push('# vectalon perf — static performance scan')
  lines.push('')
  lines.push(`- Scanned ${report.fileCount} source files in ${report.root}`)
  lines.push(`- ${report.summary.total} finding(s): ` +
    `${report.summary.byCategory.render} render · ${report.summary.byCategory.startup} startup · ${report.summary.byCategory.bridge} bridge`)
  lines.push('')
  if (report.summary.topRecommendations.length > 0) {
    lines.push('## Top recommendations')
    lines.push('')
    report.summary.topRecommendations.forEach((r, i) => lines.push(`${i + 1}. ${r}`))
    lines.push('')
  }
  lines.push('## Findings')
  lines.push('')
  if (report.findings.length === 0) {
    lines.push('No static performance hazards found.')
  }
  for (const f of report.findings) {
    lines.push(`### [${f.severity.toUpperCase()}] ${f.id} — ${f.file}:${f.line}`)
    lines.push('')
    lines.push(`${f.message}`)
    lines.push('')
    lines.push(`- **Target:** \`${f.target}\` (${f.metric})`)
    lines.push(`- **Category:** ${f.category} · Roadmap ${f.roadmap}`)
    lines.push(`- **Fix:** ${f.suggestion}`)
    lines.push('')
  }
  return lines.join('\n')
}

/** Write report.json + report.md into docs/vectalon/perf/ (gitignored). */
export function writePerfReport(root: string, report: PerfScanReport): { jsonPath: string; mdPath: string } {
  const dir = perfDocsDir(root)
  mkdirSync(dir, { recursive: true })
  const jsonPath = join(dir, 'report.json')
  const mdPath = join(dir, 'report.md')
  writeFileSync(jsonPath, JSON.stringify(report, null, 2) + '\n')
  writeFileSync(mdPath, renderPerfMarkdown(report))
  return { jsonPath, mdPath }
}
