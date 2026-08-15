/**
 * vectalon repos — Multi-repository Memory Agent (Roadmap Phase 10, item 085)
 * Business Source License 1.1 (BSL-1.1)
 *
 * Verifies the workspace manifest against local sibling checkouts. Reports
 * to docs/vectalon/repos/ (gitignored).
 */
import { resolve } from 'path'
import pc from 'picocolors'
import { printCarbonReport, dim } from '../carbon'
import { runReposScan, writeReposReport } from '../../repos'

export interface ReposCommandOptions {
  /** Print machine-readable output. */
  json?: boolean
}

export async function reposCommand(directory: string, options: ReposCommandOptions): Promise<void> {
  const root = resolve(directory || process.cwd())
  const report = runReposScan(root)
  const { jsonPath } = writeReposReport(root, report)

  if (options.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n')
    return
  }

  const body: string[] = []
  body.push(`manifest: ${report.manifestFile ?? 'none'} | repos: ${report.repoCount}`)
  body.push('')
  for (const c of report.checks) {
    const mark = c.status === 'ok' ? pc.green('✔') : c.status === 'no-memory' ? pc.yellow('▲') : pc.red('✖')
    body.push(`  ${mark} ${c.name.padEnd(24)} ${c.path} — ${c.evidence}`)
  }
  for (const f of report.findings.slice(0, 15)) {
    const icon = f.severity === 'warning' ? pc.yellow('▲') : dim('•')
    body.push(`  ${icon} [${f.severity}] ${f.id} ${f.repo ? `— ${f.repo}` : ''}`)
    body.push(`    ${f.message}`)
  }

  printCarbonReport({
    title: 'vectalon repos — Multi-repository Memory Agent (085)',
    verdict: report.verdict,
    lines: body,
    reportPath: jsonPath,
    root,
  })
}
