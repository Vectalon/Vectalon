/**
 * vectalon gh-issue — GitHub Issue Intelligence Agent (Roadmap Phase 11,
 * item 091) — Business Source License 1.1 (BSL-1.1)
 *
 * Triage signal from the open-issue backlog. Reports to
 * docs/vectalon/gh-issue/ (gitignored).
 */
import { resolve } from 'path'
import pc from 'picocolors'
import { printCarbonReport, dim } from '../carbon'
import { runGhIssue, writeGhIssueReport } from '../../ghIssue'

export interface GhIssueCommandOptions {
  /** Read issue JSON from an export file instead of the gh CLI. */
  file?: string
  /** Maximum number of issues to analyze. */
  max?: number
  /** Print machine-readable output. */
  json?: boolean
}

export async function ghIssueCommand(directory: string, options: GhIssueCommandOptions): Promise<void> {
  const root = resolve(directory || process.cwd())
  const report = runGhIssue(root, { file: options.file, max: options.max })
  const { jsonPath } = writeGhIssueReport(root, report)

  if (options.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n')
    return
  }

  if (report.issues.length === 0) {
    const body: string[] = []
    body.push(`source: ${report.source}`)
    body.push('')
    for (const f of report.findings) {
      body.push(`  ${pc.yellow('▲')} [${f.severity}] ${f.id}`)
      body.push(`    ${f.message}`)
      body.push(`    ${dim(f.suggestion)}`)
    }
    body.push('')
    body.push('Verdict: no issue data')
    printCarbonReport({
      title: 'vectalon gh-issue — GitHub Issue Intelligence (091)',
      verdict: report.verdict,
      lines: body,
      reportPath: jsonPath,
      root,
    })
    return
  }
  const s = report.summary
  const body: string[] = []
  body.push(`source: ${report.source}`)
  body.push(`Open: ${s.total} | stale: ${pc.yellow(String(s.stale))} | unassigned: ${pc.yellow(String(s.unassigned))} | triaged: ${pc.green(String(s.triaged))}`)
  body.push('')
  for (const i of report.issues) {
    body.push(`  #${String(i.number).padEnd(5)} ${i.title.slice(0, 48).padEnd(50)} ${String(i.ageDays).padStart(3)}d  ${i.labels.join(',') || dim('unlabeled')}  ${i.verdict}`)
  }
  body.push('')
  for (const f of report.findings.filter(x => x.severity === 'warning')) {
    body.push(`  ${pc.yellow('▲')} [${f.severity}] ${f.id}${f.issue ? ` (issue #${f.issue})` : ''} — ${f.message}`)
  }

  printCarbonReport({
    title: 'vectalon gh-issue — GitHub Issue Intelligence (091)',
    verdict: report.verdict,
    lines: body,
    reportPath: jsonPath,
    root,
  })
}
