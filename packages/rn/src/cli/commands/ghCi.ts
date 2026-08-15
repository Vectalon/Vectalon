/**
 * vectalon gh-ci — GitHub Workflow Reliability Agent (Roadmap Phase 11,
 * item 092) — Business Source License 1.1 (BSL-1.1)
 *
 * Flake + duration intelligence from workflow-run history. Reports to
 * docs/vectalon/gh-ci/ (gitignored).
 */
import { resolve } from 'path'
import pc from 'picocolors'
import { printCarbonReport, dim } from '../carbon'
import { runGhCi, writeGhCiReport } from '../../ghCi'

export interface GhCiCommandOptions {
  /** Read run JSON from an export file instead of the gh CLI. */
  file?: string
  /** Number of recent runs to fetch. */
  limit?: number
  /** Print machine-readable output. */
  json?: boolean
}

export async function ghCiCommand(directory: string, options: GhCiCommandOptions): Promise<void> {
  const root = resolve(directory || process.cwd())
  const report = runGhCi(root, { file: options.file, limit: options.limit })
  const { jsonPath } = writeGhCiReport(root, report)

  if (options.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n')
    return
  }

  if (report.workflows.length === 0) {
    const body: string[] = []
    body.push(`source: ${report.source}`)
    body.push('')
    for (const f of report.findings) {
      body.push(`  ${pc.yellow('▲')} [${f.severity}] ${f.id}`)
      body.push(`    ${f.message}`)
      body.push(`    ${dim(f.suggestion)}`)
    }
    printCarbonReport({
      title: 'vectalon gh-ci — GitHub Workflow Reliability (092)',
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
  body.push(`Workflows: ${s.workflows} | runs: ${s.runs} | flaky: ${pc.yellow(String(s.flakyWorkflows))} | failing: ${pc.yellow(String(s.failingWorkflows))} | avg: ${Math.round(s.avgDurationSec / 60)}m`)
  body.push('')
  for (const w of report.workflows) {
    const flag = w.flaky ? pc.red(' FLAKY') : w.failureRate >= 0.15 && w.runs >= 3 ? pc.yellow(' FAILING') : ''
    body.push(`  ${w.name.padEnd(30)} ${String(w.runs).padStart(3)} runs  ${String(Math.round(w.failureRate * 100)).padStart(3)}% fail  ${Math.round(w.avgDurationSec / 60)}m${flag}`)
  }
  body.push('')
  for (const f of report.findings.filter(x => x.severity === 'warning')) {
    body.push(`  ${pc.yellow('▲')} [${f.severity}] ${f.id} (${f.workflow}) — ${f.message}`)
  }

  printCarbonReport({
    title: 'vectalon gh-ci — GitHub Workflow Reliability (092)',
    verdict: report.verdict,
    lines: body,
    reportPath: jsonPath,
    root,
  })
}
