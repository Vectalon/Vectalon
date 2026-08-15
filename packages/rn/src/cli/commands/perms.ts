/**
 * vectalon perms — Agent Permissions Audit (Roadmap Phase 9, item 078)
 * Business Source License 1.1 (BSL-1.1)
 *
 * Audits agent/MCP config for over-permissioned tool grants and embedded
 * credentials. Reports to docs/vectalon/perms/ (gitignored).
 */
import { resolve } from 'path'
import pc from 'picocolors'
import { printCarbonReport, parchment, dim } from '../carbon'
import { runPermsScan, writePermsReport } from '../../perms'

export interface PermsCommandOptions {
  /** Print machine-readable output. */
  json?: boolean
}

export async function permsCommand(directory: string, options: PermsCommandOptions): Promise<void> {
  const root = resolve(directory || process.cwd())
  const report = runPermsScan(root)
  const { jsonPath } = writePermsReport(root, report)

  if (options.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n')
    return
  }

  const body: string[] = []
  body.push(`config files: ${report.configFiles.length}`)
  body.push('')
  if (report.configFiles.length === 0) {
    body.push('No agent/MCP config files found — nothing to audit.')
  }
  for (const f of report.findings) {
    const icon = f.severity === 'error' ? pc.red('✖') : f.severity === 'warning' ? pc.yellow('▲') : dim('•')
    body.push(`  ${icon} [${f.severity}] ${f.id} — ${f.file}:${f.line}`)
    body.push(`    ${parchment(f.message)}`)
    body.push(`    ${dim(f.suggestion)}`)
  }

  printCarbonReport({
    title: 'vectalon perms — Agent Permissions Audit (078)',
    verdict: report.verdict,
    lines: body,
    reportPath: jsonPath,
    root,
  })
}
