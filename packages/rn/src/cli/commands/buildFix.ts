/**
 * vectalon build-fix — Build Fix Agent (Roadmap Phase 8, item 064)
 * Business Source License 1.1 (BSL-1.1)
 *
 * Diagnoses a failing Metro, Gradle, or Xcode build from its log: the kind
 * is auto-detected (or forced), the root cause is classified with the
 * standard fix, and corroborating failures are listed — as a fix plan.
 * Reports to docs/vectalon/build-fix/ (gitignored) with --json output.
 */
import { resolve } from 'path'
import pc from 'picocolors'
import { printCarbonReport, parchment, dim } from '../carbon'
import { runBuildFix, writeBuildFixReport } from '../../buildFix'
import type { BuildFixOptions, BuildKind } from '../../buildFix'

export interface BuildFixCommandOptions extends BuildFixOptions {
  /** Print machine-readable output. */
  json?: boolean
}

export async function buildFixCommand(directory: string, options: BuildFixCommandOptions): Promise<void> {
  const root = resolve(directory || process.cwd())

  const report = runBuildFix(root, options)
  const { jsonPath } = writeBuildFixReport(root, report)

  if (options.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n')
    return
  }

  if (report.detection === 'none') {
    printCarbonReport({
      title: 'vectalon build-fix — Build Fix Agent (064)',
      verdict: report.verdict,
      lines: [
        'No build log provided.',
        dim('Pass --log <path> to a failing Metro/Gradle/Xcode log — the kind is auto-detected.'),
        dim('Or force it: --metro / --gradle / --xcode'),
      ],
      reportPath: jsonPath,
      root,
    })
    return
  }

  const body: string[] = []
  body.push(`Build system: ${pc.bold(report.kind)} (${report.detection === 'forced' ? 'forced' : 'auto-detected'})`)
  body.push(`Findings: ${report.summary.total} (${report.summary.bySeverity.error} error(s), ${report.summary.bySeverity.warning} warning(s))`)
  body.push('')

  for (const f of report.findings) {
    const icon = f.severity === 'error' ? pc.red('✖') : pc.yellow('▲')
    const loc = f.line ? ` (log line ${f.line})` : ''
    body.push(`  ${icon} [${f.severity}] ${f.id}${loc}`)
    body.push(`    ${parchment(f.message)}`)
    body.push(`    ${dim(f.fix)}`)
  }
  body.push('')
  body.push(pc.bold('Fix plan'))
  report.summary.fixPlan.forEach((step, i) => body.push(`  ${i + 1}. ${step}`))

  printCarbonReport({
    title: 'vectalon build-fix — Build Fix Agent (064)',
    verdict: report.verdict,
    lines: body,
    reportPath: jsonPath,
    root,
    done: 'Build fix diagnosis complete — apply the fix plan and re-run the build.',
  })
}

/** Parse --metro/--gradle/--xcode into a forced kind (undefined when absent). */
export function forcedKind(flags: { metro?: boolean; gradle?: boolean; xcode?: boolean }): BuildKind | undefined {
  if (flags.metro) return 'metro'
  if (flags.gradle) return 'gradle'
  if (flags.xcode) return 'xcode'
  return undefined
}
