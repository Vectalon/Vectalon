/**
 * vectalon arch-score — Mobile Architecture Scorecard (Roadmap Phase 9,
 * item 072) — Business Source License 1.1 (BSL-1.1)
 *
 * Scores the module graph 0-100 across cycles, layering, coupling,
 * cohesion, testability, and depth. Reports to docs/vectalon/arch-score/
 * (gitignored).
 */
import { resolve } from 'path'
import pc from 'picocolors'
import { printCarbonReport, dim } from '../carbon'
import { runArchScore, writeArchScoreReport } from '../../archScore'
import type { ArchScoreOptions } from '../../archScore'

export interface ArchScoreCommandOptions extends ArchScoreOptions {
  /** Print machine-readable output. */
  json?: boolean
}

export async function archScoreCommand(directory: string, options: ArchScoreCommandOptions): Promise<void> {
  const root = resolve(directory || process.cwd())
  const report = runArchScore(root, { srcDir: options.srcDir })
  const { jsonPath } = writeArchScoreReport(root, report)

  if (options.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n')
    return
  }

  const body: string[] = []
  const color = report.total >= 85 ? pc.green : report.total >= 70 ? pc.yellow : pc.red
  body.push(`Score: ${color(`${report.total}/100 (grade ${report.grade})`)}`)
  body.push('')
  for (const d of report.dimensions) {
    const c = d.score >= 85 ? pc.green : d.score >= 60 ? pc.yellow : pc.red
    body.push(`  ${c(String(d.score).padStart(3))}  ${d.label.padEnd(18)} ${dim(d.detail)}`)
  }
  body.push('')
  body.push(pc.bold('Top improvements:'))
  for (const i of report.topImprovements) body.push(`  → ${i}`)

  printCarbonReport({
    title: 'vectalon arch-score — Mobile Architecture Scorecard (072)',
    verdict: report.verdict,
    lines: body,
    reportPath: jsonPath,
    root,
  })
}
