/**
 * vectalon evals — Model Evaluation Harness (Roadmap Phase 11, item 095)
 * Business Source License 1.1 (BSL-1.1)
 *
 * Scores golden eval cases deterministically. Reports to
 * docs/vectalon/evals/ (gitignored).
 */
import { resolve } from 'path'
import pc from 'picocolors'
import { printCarbonReport, dim } from '../carbon'
import { runEvalsCommand, writeEvalsReport } from '../../evals'

export interface EvalsCommandOptions {
  /** Path to the cases file (default .vectalon/evals/cases.json). */
  cases?: string
  /** Print machine-readable output. */
  json?: boolean
}

export async function evalsCommand(directory: string, options: EvalsCommandOptions): Promise<void> {
  const root = resolve(directory || process.cwd())
  const report = runEvalsCommand(root, { cases: options.cases })
  const { jsonPath } = writeEvalsReport(root, report)

  if (options.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n')
    return
  }

  const r = report.regression
  const body: string[] = []
  body.push(`source: ${report.source}`)
  body.push(
    `Cases: ${report.cases.length} | pass: ${pc.green(String(report.passed))}/${report.cases.length} (${report.passRate}%)${r.delta !== null ? dim(` | Δ ${r.delta >= 0 ? '+' : ''}${r.delta}pt vs previous`) : ''}`,
  )
  body.push('')
  for (const c of report.cases) {
    body.push(`  ${c.passed ? pc.green('✓') : pc.red('✗')} ${c.id.padEnd(24)} [${c.mode}] ${c.note}`)
  }
  body.push('')
  for (const f of report.findings.filter(x => x.severity === 'warning')) {
    body.push(`  ${pc.yellow('▲')} [${f.severity}] ${f.id} — ${f.message}`)
  }

  printCarbonReport({
    title: 'vectalon evals — Model Evaluation Harness (095)',
    verdict: report.verdict,
    lines: body,
    reportPath: jsonPath,
    root,
  })
}
