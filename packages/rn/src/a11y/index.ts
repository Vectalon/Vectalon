/**
 * vectalon a11y — Accessibility Agent (Roadmap Phase 8, item 068)
 * Business Source License 1.1 (BSL-1.1)
 *
 * One deterministic pass over a project's source files that flags
 * accessibility debt: unlabeled images (error), touchables without roles,
 * unlabeled TextInputs, and undersized touch targets — every finding
 * line-pinned with a concrete fix. Hermetic-testable (pure file reads).
 * Reports to docs/vectalon/a11y/ (gitignored).
 */

import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { reportError } from '../utils/safe'
import { walkProjectFiles } from '../upgrade/scan'
import { scanA11yFile } from './scan'
import type { A11yFinding, A11yReport, A11ySummary, A11yVerdict } from './types'

export type { A11yFinding, A11yReport, A11ySummary, A11ySeverity, A11yVerdict } from './types'

/** Where a11y reports are written (mirrors other docs/vectalon/* dirs). */
export const a11yDocsDir = (root: string): string => join(root, 'docs', 'vectalon', 'a11y')

export function verdictOf(findings: A11yFinding[]): A11yVerdict {
  if (findings.some(f => f.severity === 'error')) return 'changes-requested'
  if (findings.some(f => f.severity === 'warning')) return 'needs-attention'
  return 'approved'
}

function severityRank(sev: A11yFinding['severity']): number {
  return sev === 'error' ? 3 : sev === 'warning' ? 2 : 1
}

/** Roll findings into counts + top recommendations. */
export function summarizeA11y(findings: A11yFinding[]): A11ySummary {
  const bySeverity: A11ySummary['bySeverity'] = { error: 0, warning: 0, info: 0 }
  for (const f of findings) bySeverity[f.severity] = (bySeverity[f.severity] ?? 0) + 1
  const ranked = [...findings].sort((a, b) => severityRank(b.severity) - severityRank(a.severity))
  const seen = new Set<string>()
  const topRecommendations: string[] = []
  for (const f of ranked) {
    const key = `${f.id}:${f.file}:${f.line}`
    if (seen.has(key)) continue
    seen.add(key)
    topRecommendations.push(`${f.message} — ${f.suggestion} (${f.file}:${f.line})`)
    if (topRecommendations.length >= 3) break
  }
  return { total: findings.length, bySeverity, topRecommendations }
}

/** Run one accessibility scan across the project. */
export function runA11yScan(root: string): A11yReport {
  const scannedAt = Date.now()
  const files = walkProjectFiles(root).filter(f => /\.(tsx|jsx)$/.test(f))
  const findings: A11yFinding[] = []
  for (const file of files) {
    let content: string
    try {
      content = readFileSync(join(root, file), 'utf-8')
    } catch (err) {
      reportError(err, `a11y: reading ${file}`)
      continue
    }
    findings.push(...scanA11yFile(file, content))
  }
  findings.sort((a, b) => severityRank(b.severity) - severityRank(a.severity))
  return {
    scannedAt,
    root,
    fileCount: files.length,
    findings,
    summary: summarizeA11y(findings),
    verdict: verdictOf(findings),
  }
}

/** Human-readable markdown report. */
export function renderA11yMarkdown(report: A11yReport): string {
  const lines: string[] = []
  lines.push('# vectalon a11y — Accessibility Review')
  lines.push('')
  lines.push(`- Verdict: **${report.verdict}**`)
  lines.push(`- ${report.fileCount} component files scanned in ${report.root}`)
  lines.push(`- Findings: ${report.summary.total} (` +
    `${report.summary.bySeverity.error} error(s), ${report.summary.bySeverity.warning} warning(s))`)
  lines.push('')
  if (report.summary.topRecommendations.length > 0) {
    lines.push('## Top fixes')
    lines.push('')
    report.summary.topRecommendations.forEach((r, i) => lines.push(`${i + 1}. ${r}`))
    lines.push('')
  }
  lines.push('## Findings')
  lines.push('')
  if (report.findings.length === 0) {
    lines.push('No accessibility issues found — the component tree is screen-reader friendly.')
  }
  for (const f of report.findings) {
    lines.push(`### [${f.severity.toUpperCase()}] ${f.id} — ${f.file}:${f.line}`)
    lines.push('')
    lines.push(f.message)
    lines.push('')
    lines.push(`- **Element:** \`${f.target}\``)
    lines.push(`- **Fix:** ${f.suggestion}`)
    lines.push('')
  }
  return lines.join('\n')
}

/** Write report.json + report.md into docs/vectalon/a11y/ (gitignored). */
export function writeA11yReport(root: string, report: A11yReport): { jsonPath: string; mdPath: string } {
  const dir = a11yDocsDir(root)
  mkdirSync(dir, { recursive: true })
  const jsonPath = join(dir, 'report.json')
  const mdPath = join(dir, 'report.md')
  writeFileSync(jsonPath, JSON.stringify(report, null, 2) + '\n')
  writeFileSync(mdPath, renderA11yMarkdown(report))
  return { jsonPath, mdPath }
}
