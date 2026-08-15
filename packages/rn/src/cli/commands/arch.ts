/**
 * vectalon arch — Architecture Review Agent (Roadmap Phase 8, item 062)
 * Business Source License 1.1 (BSL-1.1)
 *
 * Reviews a project's architecture in one deterministic pass: module
 * boundaries and coupling metrics, circular dependencies, layering
 * violations, god modules, wide fan-in, orphans, and deep nesting — with a
 * verdict and severity-ranked recommendations. Reports to
 * docs/vectalon/arch/ (gitignored) with --json output.
 */
import { resolve } from 'path'
import pc from 'picocolors'
import { printCarbonReport, parchment, dim } from '../carbon'
import { runArchReview, writeArchReport } from '../../arch'
import type { ArchOptions } from '../../arch'

export interface ArchCommandOptions extends ArchOptions {
  /** Print machine-readable output. */
  json?: boolean
}

export async function archCommand(directory: string, options: ArchCommandOptions): Promise<void> {
  const root = resolve(directory || process.cwd())

  const report = runArchReview(root, options)
  const { jsonPath } = writeArchReport(root, report)

  if (options.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n')
    return
  }

  const body: string[] = []
  body.push(`Files: ${report.fileCount} in ${report.srcDir}/ | Modules: ${report.modules.length}`)
  body.push(`Findings: ${report.summary.total} (${report.summary.bySeverity.error} error(s), ${report.summary.bySeverity.warning} warning(s), ${report.summary.bySeverity.info} info)`)
  body.push('')

  if (report.modules.length > 0) {
    body.push(pc.bold('Modules'))
    for (const m of report.modules) {
      body.push(`  ${pc.bold(m.path)}  ${dim(`${m.files} file(s), fan-in ${m.fanIn}, fan-out ${m.fanOut}`)}`)
    }
    body.push('')
  }

  if (report.findings.length === 0) {
    body.push('No architecture issues found — the module graph is clean.')
  }
  for (const f of report.findings) {
    const icon = f.severity === 'error' ? pc.red('✖') : f.severity === 'warning' ? pc.yellow('▲') : dim('•')
    body.push(`  ${icon} [${f.severity}] ${f.id} — ${f.file || f.module}`)
    body.push(`    ${parchment(f.message)}`)
    body.push(`    ${dim(f.suggestion)}`)
  }
  body.push('')

  for (const line of report.summary.topRecommendations) {
    body.push(`→ ${line}`)
  }

  printCarbonReport({
    title: 'vectalon arch — Architecture Review Agent (062)',
    verdict: report.verdict,
    lines: body,
    reportPath: jsonPath,
    root,
    done: 'Architecture review complete — address the findings before the debt compounds.',
  })
}
