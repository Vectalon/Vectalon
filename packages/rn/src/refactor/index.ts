/**
 * vectalon refactor — Refactoring Agent (Roadmap Phase 8, item 066)
 * Business Source License 1.1 (BSL-1.1)
 *
 * One deterministic pass over a project's source files that proposes
 * concrete, safe refactors: dead code, duplication, modernization, type
 * smells, style debt, and complexity — every finding line-pinned with a
 * specific suggestion and severity-ranked. Hermetic-testable (pure file
 * reads). Reports to docs/vectalon/refactor/ (gitignored).
 */

import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { reportError } from '../utils/safe'
import { walkProjectFiles } from '../upgrade/scan'
import { scanRefactorFile } from './scan'
import type { RefactorFinding, RefactorReport, RefactorSummary, RefactorVerdict } from './types'

export type { RefactorFinding, RefactorReport, RefactorSummary, RefactorSeverity, RefactorCategory, RefactorVerdict } from './types'

/** Where refactor reports are written (mirrors other docs/vectalon/* dirs). */
export const refactorDocsDir = (root: string): string => join(root, 'docs', 'vectalon', 'refactor')

/** The overall verdict: nothing is a hard error — debt scans need attention. */
export function verdictOf(findings: RefactorFinding[]): RefactorVerdict {
  if (findings.some(f => f.severity === 'error')) return 'changes-requested'
  if (findings.some(f => f.severity === 'warning')) return 'needs-attention'
  return 'approved'
}

function severityRank(sev: RefactorFinding['severity']): number {
  return sev === 'error' ? 3 : sev === 'warning' ? 2 : 1
}

/** Roll findings into counts + top opportunities (mirrors perf's engine). */
export function summarizeRefactor(findings: RefactorFinding[]): RefactorSummary {
  const bySeverity: RefactorSummary['bySeverity'] = { error: 0, warning: 0, info: 0 }
  const byCategory: RefactorSummary['byCategory'] = {
    'dead-code': 0, duplication: 0, modernization: 0, types: 0, complexity: 0, styles: 0, logging: 0,
  }
  for (const f of findings) {
    bySeverity[f.severity] = (bySeverity[f.severity] ?? 0) + 1
    byCategory[f.category] = (byCategory[f.category] ?? 0) + 1
  }
  const ranked = [...findings].sort((a, b) => severityRank(b.severity) - severityRank(a.severity))
  const seen = new Set<string>()
  const topRecommendations: string[] = []
  for (const f of ranked) {
    const key = `${f.id}:${f.file}:${f.line}`
    if (seen.has(key)) continue
    seen.add(key)
    topRecommendations.push(`${f.message} — ${f.suggestion} (${f.file}${f.line ? `:${f.line}` : ''})`)
    if (topRecommendations.length >= 3) break
  }
  return { total: findings.length, bySeverity, byCategory, topRecommendations }
}

/** Run one refactor scan across the project's source files. */
export function runRefactorScan(root: string): RefactorReport {
  const scannedAt = Date.now()
  const files = walkProjectFiles(root)
  const findings: RefactorFinding[] = []
  for (const file of files) {
    let content: string
    try {
      content = readFileSync(join(root, file), 'utf-8')
    } catch (err) {
      reportError(err, `refactor: reading ${file}`)
      continue
    }
    findings.push(...scanRefactorFile(file, content))
  }
  findings.sort((a, b) => severityRank(b.severity) - severityRank(a.severity) || a.id.localeCompare(b.id))
  return {
    scannedAt,
    root,
    fileCount: files.length,
    findings,
    summary: summarizeRefactor(findings),
    verdict: verdictOf(findings),
  }
}

/** Human-readable markdown report (mirrors perf/diagnostics renderers). */
export function renderRefactorMarkdown(report: RefactorReport): string {
  const lines: string[] = []
  lines.push('# vectalon refactor — Refactor Opportunities')
  lines.push('')
  lines.push(`- Verdict: **${report.verdict}**`)
  lines.push(`- ${report.fileCount} source files scanned in ${report.root}`)
  lines.push(`- Findings: ${report.summary.total} (` +
    `${report.summary.bySeverity.warning} warning(s), ${report.summary.bySeverity.info} info)`)
  lines.push('')

  if (report.summary.topRecommendations.length > 0) {
    lines.push('## Top opportunities')
    lines.push('')
    report.summary.topRecommendations.forEach((r, i) => lines.push(`${i + 1}. ${r}`))
    lines.push('')
  }

  lines.push('## Findings')
  lines.push('')
  if (report.findings.length === 0) {
    lines.push('No refactor opportunities found — the code is clean.')
  }
  for (const f of report.findings) {
    const loc = f.line > 0 ? `${f.file}:${f.line}` : f.file
    lines.push(`### [${f.severity.toUpperCase()}] ${f.id} — ${loc}`)
    lines.push('')
    lines.push(f.message)
    lines.push('')
    lines.push(`- **Target:** \`${f.target}\` · ${f.category}`)
    lines.push(`- **Refactor:** ${f.suggestion}`)
    lines.push('')
  }
  return lines.join('\n')
}

/** Write report.json + report.md into docs/vectalon/refactor/ (gitignored). */
export function writeRefactorReport(root: string, report: RefactorReport): { jsonPath: string; mdPath: string } {
  const dir = refactorDocsDir(root)
  mkdirSync(dir, { recursive: true })
  const jsonPath = join(dir, 'report.json')
  const mdPath = join(dir, 'report.md')
  writeFileSync(jsonPath, JSON.stringify(report, null, 2) + '\n')
  writeFileSync(mdPath, renderRefactorMarkdown(report))
  return { jsonPath, mdPath }
}
