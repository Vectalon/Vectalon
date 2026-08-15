/**
 * vectalon app-store — App Store Readiness Agent (Roadmap Phase 9, item 074)
 * Business Source License 1.1 (BSL-1.1)
 *
 * iOS/Android store-readiness checks: version consistency, icons, privacy
 * manifest, permissions, cleartext posture. Reports to
 * docs/vectalon/app-store/ (gitignored).
 */
import { resolve } from 'path'
import pc from 'picocolors'
import { printCarbonReport, parchment, dim } from '../carbon'
import { runStoreScan, writeStoreReport } from '../../appStore'

export interface AppStoreCommandOptions {
  /** Print machine-readable output. */
  json?: boolean
}

export async function appStoreCommand(directory: string, options: AppStoreCommandOptions): Promise<void> {
  const root = resolve(directory || process.cwd())
  const report = runStoreScan(root)
  const { jsonPath } = writeStoreReport(root, report)

  if (options.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n')
    return
  }

  const body: string[] = []
  if (report.findings.length === 0) body.push('No store-readiness issues found.')
  for (const f of report.findings) {
    const icon = f.severity === 'error' ? pc.red('✖') : f.severity === 'warning' ? pc.yellow('▲') : dim('•')
    body.push(`  ${icon} [${f.severity}] ${f.platform} — ${parchment(f.message)}`)
    body.push(`    ${dim(f.suggestion)}`)
  }

  printCarbonReport({
    title: 'vectalon app-store — Store Readiness Agent (074)',
    verdict: report.verdict,
    lines: body,
    reportPath: jsonPath,
    root,
  })
}
