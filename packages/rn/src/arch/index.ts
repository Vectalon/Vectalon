/**
 * vectalon arch — Architecture Review Agent (Roadmap Phase 8, item 062)
 * Business Source License 1.1 (BSL-1.1)
 *
 * One deterministic pass over a project's source tree that reviews its
 * architecture: module boundaries and coupling metrics, circular
 * dependencies, layering violations, god modules, wide fan-in, orphans, and
 * over-deep nesting — with a verdict and severity-ranked recommendations.
 * Hermetic-testable: it only reads the tree (no git, no model calls).
 * Reports to docs/vectalon/arch/ (gitignored).
 */

import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { analyzeArchitecture } from './analyze'
import type { ArchFinding, ArchOptions, ArchReport, ArchSummary, ArchVerdict } from './types'

export type { ArchFinding, ArchModule, ArchOptions, ArchReport, ArchSummary, ArchSeverity, ArchCategory, ArchVerdict } from './types'

/** Where architecture reports are written (mirrors other docs/vectalon/* dirs). */
export const archDocsDir = (root: string): string => join(root, 'docs', 'vectalon', 'arch')

/** The overall verdict: errors block, warnings need attention, else approve. */
export function verdictOf(findings: ArchFinding[]): ArchVerdict {
  if (findings.some(f => f.severity === 'error')) return 'changes-requested'
  if (findings.some(f => f.severity === 'warning')) return 'needs-attention'
  return 'approved'
}

function severityRank(sev: ArchFinding['severity']): number {
  return sev === 'error' ? 3 : sev === 'warning' ? 2 : 1
}

/** Roll findings into counts + top recommendations (mirrors perf's engine). */
export function summarizeArch(findings: ArchFinding[]): ArchSummary {
  const bySeverity: ArchSummary['bySeverity'] = { error: 0, warning: 0, info: 0 }
  const byCategory: ArchSummary['byCategory'] = { structure: 0, layering: 0, coupling: 0 }
  for (const f of findings) {
    bySeverity[f.severity] = (bySeverity[f.severity] ?? 0) + 1
    byCategory[f.category] = (byCategory[f.category] ?? 0) + 1
  }
  const ranked = [...findings].sort((a, b) => severityRank(b.severity) - severityRank(a.severity))
  const seen = new Set<string>()
  const topRecommendations: string[] = []
  for (const f of ranked) {
    const key = `${f.id}:${f.file}`
    if (seen.has(key)) continue
    seen.add(key)
    topRecommendations.push(`${f.message} — ${f.suggestion} (${f.file || f.module})`)
    if (topRecommendations.length >= 3) break
  }
  return { total: findings.length, bySeverity, byCategory, topRecommendations }
}

/** Run one architecture-review pass over a project root. */
export function runArchReview(root: string, options: ArchOptions = {}): ArchReport {
  const scannedAt = Date.now()
  const { fileCount, modules, findings } = analyzeArchitecture(root, options)
  findings.sort((a, b) => severityRank(b.severity) - severityRank(a.severity) || a.id.localeCompare(b.id))
  return {
    scannedAt,
    root,
    srcDir: options.srcDir || 'src',
    fileCount,
    modules,
    findings,
    summary: summarizeArch(findings),
    verdict: verdictOf(findings),
  }
}

/** Human-readable markdown report (mirrors perf/diagnostics renderers). */
export function renderArchMarkdown(report: ArchReport): string {
  const lines: string[] = []
  lines.push('# vectalon arch — Architecture Review')
  lines.push('')
  lines.push(`- Verdict: **${report.verdict}**`)
  lines.push(`- ${report.fileCount} source files in ${report.srcDir}/ (${report.root})`)
  lines.push(`- Findings: ${report.summary.total} (` +
    `${report.summary.bySeverity.error} error(s), ${report.summary.bySeverity.warning} warning(s), ${report.summary.bySeverity.info} info)`)
  lines.push('')

  if (report.modules.length > 0) {
    lines.push('## Modules')
    lines.push('')
    lines.push('| Module | Files | Fan-in | Fan-out | External packages |')
    lines.push('|--------|------:|-------:|--------:|-------------------|')
    for (const m of report.modules) {
      lines.push(`| ${m.path} | ${m.files} | ${m.fanIn} | ${m.fanOut} | ${m.externalPackages.join(', ') || '—'} |`)
    }
    lines.push('')
  }

  if (report.summary.topRecommendations.length > 0) {
    lines.push('## Top recommendations')
    lines.push('')
    report.summary.topRecommendations.forEach((r, i) => lines.push(`${i + 1}. ${r}`))
    lines.push('')
  }

  lines.push('## Findings')
  lines.push('')
  if (report.findings.length === 0) {
    lines.push('No architecture issues found — the module graph is clean.')
  }
  for (const f of report.findings) {
    lines.push(`### [${f.severity.toUpperCase()}] ${f.id} — ${f.file || f.module}`)
    lines.push('')
    lines.push(f.message)
    lines.push('')
    lines.push(`- **Module:** ${f.module || '(src root)'} · ${f.category}`)
    lines.push(`- **Fix:** ${f.suggestion}`)
    lines.push('')
  }
  return lines.join('\n')
}

/** Write report.json + report.md into docs/vectalon/arch/ (gitignored). */
export function writeArchReport(root: string, report: ArchReport): { jsonPath: string; mdPath: string } {
  const dir = archDocsDir(root)
  mkdirSync(dir, { recursive: true })
  const jsonPath = join(dir, 'report.json')
  const mdPath = join(dir, 'report.md')
  writeFileSync(jsonPath, JSON.stringify(report, null, 2) + '\n')
  writeFileSync(mdPath, renderArchMarkdown(report))
  return { jsonPath, mdPath }
}
