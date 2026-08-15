/**
 * vectalon dx — DX Scoring Agent (Roadmap Phase 11, item 100)
 * Business Source License 1.1 (BSL-1.1)
 *
 * One developer-experience score from local evidence. Reports to
 * docs/vectalon/dx/ (gitignored).
 */
import { resolve } from 'path'
import pc from 'picocolors'
import { printCarbonReport, parchment, dim } from '../carbon'
import { runDx, writeDxReport } from '../../dx'

export interface DxCommandOptions {
  /** Print machine-readable output. */
  json?: boolean
}

export async function dxCommand(directory: string, options: DxCommandOptions): Promise<void> {
  const root = resolve(directory || process.cwd())
  const report = runDx(root)
  const { jsonPath } = writeDxReport(root, report)

  if (options.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n')
    return
  }

  const body: string[] = []
  const gradeColor = report.grade === 'A' ? pc.green : report.grade === 'B' ? pc.cyan : report.grade === 'C' ? pc.yellow : pc.red
  body.push(`Score: ${pc.bold(String(report.score) + '/100')} ${gradeColor(`(${report.grade})`)}`)
  body.push('')
  for (const a of report.axes) {
    const bar = '█'.repeat(Math.round(a.score / 10)).padEnd(10, '░')
    const color = a.score >= 70 ? pc.green : a.score >= 40 ? pc.yellow : pc.red
    body.push(`  ${color(bar)} ${String(a.score).padStart(3)}  ${a.label.padEnd(20)} ${dim(a.note)}`)
  }
  body.push('')
  body.push(pc.bold('Top improvements:'))
  for (const i of report.improvements) {
    body.push(`  +${i.gain}pts  ${parchment(i.label)}: ${i.action}`)
  }

  printCarbonReport({
    title: 'vectalon dx — DX Scoring Agent (100)',
    verdict: report.verdict,
    lines: body,
    reportPath: jsonPath,
    root,
  })
}
