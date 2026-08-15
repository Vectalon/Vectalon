/**
 * vectalon observability — Mobile Observability Agent (Roadmap Phase 10, item 082)
 * Business Source License 1.1 (BSL-1.1)
 *
 * Audits instrumentation coverage and slow traces. Reports to
 * docs/vectalon/observability/ (gitignored).
 */
import { resolve } from 'path'
import pc from 'picocolors'
import { printCarbonReport, dim } from '../carbon'
import { runObsScan, writeObsReport } from '../../observability'

export interface ObsCommandOptions {
  /** Print machine-readable output. */
  json?: boolean
}

export async function observabilityCommand(directory: string, options: ObsCommandOptions): Promise<void> {
  const root = resolve(directory || process.cwd())
  const report = runObsScan(root)
  const { jsonPath } = writeObsReport(root, report)

  if (options.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n')
    return
  }

  const body: string[] = []
  body.push(`traces: ${report.tracesScanned} | slow: ${report.slowTraces.length}`)
  body.push('')
  for (const f of report.findings.slice(0, 15)) {
    const icon = f.severity === 'warning' ? pc.yellow('▲') : dim('•')
    body.push(`  ${icon} [${f.severity}] ${f.id}`)
    body.push(`    ${f.message}`)
  }
  for (const s of report.slowTraces.slice(0, 5)) {
    body.push(`  ${pc.yellow('▲')} slow trace: ${s.name} — ${s.durationMs} ms${s.release ? ` (${s.release})` : ''}`)
  }

  printCarbonReport({
    title: 'vectalon observability — Mobile Observability Agent (082)',
    verdict: report.verdict,
    lines: body,
    reportPath: jsonPath,
    root,
  })
}
