/**
 * vectalon gh-pr — GitHub PR Triage Agent (Roadmap Phase 11, item 090)
 * Business Source License 1.1 (BSL-1.1)
 *
 * Scores open PRs for merge-readiness from `gh pr list` or a JSON export.
 * Reports to docs/vectalon/gh-pr/ (gitignored).
 */
import { resolve } from 'path'
import pc from 'picocolors'
import { printCarbonReport, dim } from '../carbon'
import { runGhPr, writeGhPrReport } from '../../ghPr'
import type { GhPrVerdict } from '../../ghPr'

export interface GhPrCommandOptions {
  /** Read PR JSON from an export file instead of the gh CLI. */
  file?: string
  /** Maximum number of PRs to analyze. */
  maxPrs?: number
  /** Print machine-readable output. */
  json?: boolean
}

export async function ghPrCommand(directory: string, options: GhPrCommandOptions): Promise<void> {
  const root = resolve(directory || process.cwd())
  const report = runGhPr(root, { file: options.file, maxPrs: options.maxPrs })
  const { jsonPath } = writeGhPrReport(root, report)

  if (options.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n')
    return
  }

  if (report.prs.length === 0) {
    const body: string[] = []
    body.push(`source: ${report.source}`)
    body.push('')
    for (const f of report.findings) {
      body.push(`  ${pc.yellow('▲')} [${f.severity}] ${f.id}`)
      body.push(`    ${f.message}`)
      body.push(`    ${dim(f.suggestion)}`)
    }
    body.push('')
    body.push('Verdict: no PR data')
    printCarbonReport({
      title: 'vectalon gh-pr — GitHub PR Triage Agent (090)',
      verdict: report.verdict,
      lines: body,
      reportPath: jsonPath,
      root,
    })
    return
  }

  const verdictColor = (v: GhPrVerdict): string =>
    v === 'approved' ? pc.green(v) : v === 'needs-attention' ? pc.yellow(v) : pc.red(v)
  const s = report.summary
  const body: string[] = []
  body.push(`source: ${report.source}`)
  body.push(`PRs: ${s.total} | healthy: ${pc.green(String(s.healthy))} | attention: ${pc.yellow(String(s.attention))} | blockers: ${pc.red(String(s.blockers))} | avg age: ${s.avgAgeDays}d`)
  body.push('')
  for (const p of report.prs) {
    const flags = [
      p.isDraft ? dim('draft') : '',
      p.mergeable === 'CONFLICTING' ? pc.red('conflict') : '',
      p.ciState === 'failing' ? pc.red(`ci ${p.ciFailures.join(',')}`) : '',
      p.reviewDecision === 'CHANGES_REQUESTED' ? pc.yellow('changes-requested') : '',
    ].filter(Boolean).join(' · ')
    body.push(
      `  #${String(p.number).padEnd(5)} ${p.title.slice(0, 48).padEnd(50)} ${String(p.ageDays).padStart(3)}d  ${String(p.sizeLines).padStart(5)}L  ${verdictColor(p.verdict)}${flags ? dim(`  (${flags})`) : ''}`,
    )
  }
  body.push('')
  for (const f of report.findings.filter(x => x.severity === 'warning')) {
    body.push(`  ${pc.yellow('▲')} [${f.severity}] ${f.id} (PR #${f.pr}) — ${f.message}`)
  }

  printCarbonReport({
    title: 'vectalon gh-pr — GitHub PR Triage Agent (090)',
    verdict: report.verdict,
    lines: body,
    reportPath: jsonPath,
    root,
  })
}
