/**
 * vc fix — the "Fix my React Native issue" killer workflow.
 * Business Source License 1.1 (BSL-1.1)
 *
 * `vc fix "Android build started failing after upgrading RN"` — or with
 * `--log build.log` — runs the whole loop and prints one structured verdict:
 * root cause → evidence → impact → recommended fix → applied → verification
 * → confidence. Edits apply in a sandbox by default (the diff is shown);
 * `--apply` writes them to your tree (refuses a dirty git tree unless
 * --force). Reports to docs/vectalon/fix/.
 */
import { resolve } from 'path'
import pc from 'picocolors'
import { printCarbonReport, parchment, dim } from '../carbon'
import { runFix, writeFixReport, fixDocsDir } from '../../fix'
import type { FixOptions } from '../../fix'

export interface FixCommandOptions extends FixOptions {
  /** Print machine-readable output. */
  json?: boolean
}

export async function fixCommand(issue: string, options: FixCommandOptions): Promise<void> {
  // `vc fix "<issue>"` — the positional is the issue; the project is cwd.
  const root = resolve(process.cwd())
  const report = await runFix(root, { ...options, issue: issue || options.issue })
  const { jsonPath } = writeFixReport(root, report)

  if (options.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n')
    return
  }

  const rootFinding = report.findings.find(f => f.rootCause) ?? report.findings[0]
  const body: string[] = []

  if (!rootFinding) {
    body.push(parchment('No issue reproduced from the current project state.'))
    body.push(dim('Pass a build log with --log <path>, or describe the failure — e.g. "Android build started failing after upgrading RN".'))
  } else {
    // Root cause — the headline.
    body.push(pc.bold('Root cause:'))
    body.push(`  ${rootFinding.message}`)
    body.push('')

    // Evidence — file:line pins.
    body.push(pc.bold('Evidence:'))
    for (const e of rootFinding.evidence) {
      const loc = e.file === 'log' ? (e.line ? `log line ${e.line}` : 'build log') : `${e.file}${e.line ? `:${e.line}` : ''}`
      body.push(`  ${loc} — ${e.detail}`)
    }
    body.push('')

    // Impact.
    body.push(pc.bold(`Impact:${rootFinding.impact.length === 0 ? '' : ` ${rootFinding.impact.length} package${rootFinding.impact.length === 1 ? '' : 's'}`}`))
    if (rootFinding.impact.length > 0) {
      body.push(`  ${rootFinding.impact.slice(0, 8).join(', ')}${rootFinding.impact.length > 8 ? ` … +${rootFinding.impact.length - 8}` : ''}`)
    } else {
      body.push('  —')
    }
    body.push('')

    // Recommended fix.
    body.push(pc.bold('Recommended fix:'))
    body.push(`  ${parchment(rootFinding.recommendedFix)}`)
    body.push('')

    // Applied — grouped by file so N edits to one file read as one line.
    body.push(pc.bold('Applied:'))
    const applied = report.findings.filter(f => f.applied === 'applied')
    const manual = report.findings.filter(f => f.applied === 'manual')
    if (applied.length > 0) {
      const byFile = new Map<string, number>()
      for (const f of applied) byFile.set(f.edit!.file, (byFile.get(f.edit!.file) ?? 0) + 1)
      body.push(`  ${[...byFile.entries()].map(([file, n]) => pc.green(`✓ ${file}${n > 1 ? ` ×${n}` : ''}`)).join(' · ')}`)
    } else if (!options.apply) {
      body.push(dim('  none — dry run (applied in a sandbox; pass --apply to write)'))
    } else if (report.appliedToTree) {
      body.push(dim('  none — no auto-applicable edit for this root cause'))
    } else {
      body.push(pc.yellow('  refused — working tree is dirty (commit/stash, or --force)'))
    }
    if (manual.length > 0 && manual[0] !== rootFinding) {
      body.push(dim(`  manual: ${manual.map(f => f.recommendedFix).join(' · ')}`))
    }
    body.push('')

    // Verification.
    body.push(pc.bold('Verification:'))
    for (const v of report.verification) {
      const icon = v.status === 'pass' ? pc.green('✓') : v.status === 'fail' ? pc.red('✖') : pc.dim('○')
      body.push(`  ${icon} ${v.name}${v.status === 'pass' ? '' : ` — ${dim(v.detail)}`}`)
    }
    body.push('')

    // Confidence.
    body.push(pc.bold(`Confidence: ${pc.cyan(`${report.confidence}%`)}`))
  }

  printCarbonReport({
    title: report.issue ? `vc fix — "${report.issue}"` : 'vc fix — build-log diagnosis',
    verdict: report.verdict,
    lines: body,
    reportPath: jsonPath,
    root,
    done: appliedToTreeMessage(report, root),
  })
}

function appliedToTreeMessage(report: Awaited<ReturnType<typeof runFix>>, root: string): string | undefined {
  if (report.findings.length === 0) return undefined
  if (report.appliedToTree) {
    return 'Fix applied to your tree — review the diff above before committing.'
  }
  if (report.diff) {
    return `Dry run — ${report.findings.filter(f => f.applied === 'applied').length} edit(s) verified in a sandbox. The full diff is in ${fixDocsDir(root)}. Pass --apply to write them.`
  }
  return undefined
}
