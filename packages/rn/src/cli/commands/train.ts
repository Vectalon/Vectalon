/**
 * vectalon train — Release Train Automation (Roadmap Phase 11, item 098)
 * Business Source License 1.1 (BSL-1.1)
 *
 * Dry-run release planning across the workspace. Read-only — nothing is
 * modified. Reports to docs/vectalon/train/ (gitignored).
 */
import { resolve } from 'path'
import pc from 'picocolors'
import { printCarbonReport, dim } from '../carbon'
import { runTrain, writeTrainReport } from '../../train'

export interface TrainCommandOptions {
  /** Print machine-readable output. */
  json?: boolean
}

export async function trainCommand(directory: string, options: TrainCommandOptions): Promise<void> {
  const root = resolve(directory || process.cwd())
  const report = runTrain(root)
  const { jsonPath } = writeTrainReport(root, report)

  if (options.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n')
    return
  }

  const body: string[] = []
  body.push(`Repos: ${report.repos.length} | read-only: nothing was modified`)
  body.push('')
  for (const r of report.repos) {
    const bump = r.suggestedBump === 'none' ? dim('none') : pc.bold(r.suggestedBump)
    body.push(pc.bold(r.name))
    body.push(
      `  version: ${r.version ?? dim('—')} | last tag: ${r.lastTag ?? dim('—')} | bump: ${bump} | changelog: ${r.changelogSection ? pc.green('✓') : pc.red('✗')} | clean: ${r.dirty ? pc.red('✗') : pc.green('✓')}`,
    )
    for (const c of r.checks) {
      body.push(`    ${c.severity === 'warning' ? pc.yellow('▲') : dim('•')} ${c.message}`)
    }
  }
  body.push('')
  for (const f of report.findings) {
    body.push(`  ${pc.yellow('▲')} [${f.severity}] ${f.id} (${f.repo}) — ${f.message}`)
    body.push(`    ${dim(f.suggestion)}`)
  }

  printCarbonReport({
    title: 'vectalon train — Release Train (098, dry-run)',
    verdict: report.verdict,
    lines: body,
    reportPath: jsonPath,
    root,
  })
}
