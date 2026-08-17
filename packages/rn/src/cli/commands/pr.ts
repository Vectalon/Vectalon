/**
 * vectalon pr — PR Review Agent (P0: GitHub PR integration).
 * Business Source License 1.1 (BSL-1.1)
 *
 * `vc pr` reviews a pull request deterministically — five checks over the
 * added lines, the issues found, the health impact, and a fix affordance.
 * `--comment` posts (or marker-upserts) the review as a bot comment, the
 * GitHub → Vectalon → developer workflow. Report to docs/vectalon/pr/.
 */
import { resolve } from 'path'
import pc from 'picocolors'
import { printCarbonReport, parchment, dim } from '../carbon'
import { createAdapters } from '../../adapters'
import { runPrReview, writePrReviewReport, PR_REVIEW_MARKER } from '../../prReview'
import type { PrReviewVerdict } from '../../prReview'

export interface PrCommandOptions {
  /** Raw unified diff text (offline / hermetic). */
  diff?: string
  /** Path to a file containing a unified diff. */
  diffFile?: string
  /** PR number (explicit; default: detected from the current branch). */
  number?: number
  /** Base ref for the git fallback diff (default origin/main). */
  base?: string
  /** Post (or upsert) the review as a bot comment on the PR. */
  comment?: boolean
  /** Allow the git write (comment) even without an explicit --comment. */
  push?: boolean
  /** Print machine-readable output. */
  json?: boolean
}

export async function prCommand(directory: string, options: PrCommandOptions): Promise<void> {
  const root = resolve(directory || process.cwd())

  const commenter =
    options.comment === true
      ? (number: number, body: string) => {
          const adapters = createAdapters({ root, git: { push: options.push === true } })
          return adapters.git.upsertPullRequestComment(number, PR_REVIEW_MARKER, body)
        }
      : undefined

  const report = await runPrReview(root, { diff: options.diff, diffFile: options.diffFile, number: options.number, base: options.base }, commenter)
  const { jsonPath } = writePrReviewReport(root, report)

  if (options.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n')
    return
  }

  const verdictColor = (v: PrReviewVerdict): string =>
    v === 'approved' ? pc.green(v) : v === 'needs-attention' ? pc.yellow(v) : pc.red(v)

  const body: string[] = []
  body.push(`source: ${report.source} · PR: ${report.number ?? '—'} · base: ${report.base ?? '—'}`)
  body.push(`files: ${report.changedFiles.length} · +${report.additions} −${report.deletions}`)
  if (report.changedFiles.length === 0) {
    body.push('')
    for (const f of report.issues) {
      body.push(`  ${pc.yellow('▲')} ${f.message}`)
      body.push(`    ${dim(f.suggestion)}`)
    }
    printCarbonReport({
      title: 'vectalon pr — PR Review Agent',
      verdict: report.verdict,
      lines: body,
      reportPath: jsonPath,
      root,
    })
    return
  }
  body.push('')
  for (const c of report.checks) {
    const glyph = c.status === 'pass' ? pc.green('✓') : c.status === 'warn' ? pc.yellow('⚠') : pc.red('✗')
    body.push(`  ${c.label.padEnd(14)} ${glyph}${c.issueCount > 0 ? `  ${c.issueCount} issue${c.issueCount === 1 ? '' : 's'}` : ''}`)
  }
  if (report.issues.length > 0) {
    body.push('')
    body.push(pc.bold(`Found ${report.issues.length} issue${report.issues.length === 1 ? '' : 's'}:`))
    for (const i of report.issues) {
      const pri = i.priority === 'P0' ? pc.bold(pc.red(i.priority)) : i.priority === 'P1' ? pc.bold(pc.yellow(i.priority)) : pc.dim(i.priority)
      const at = i.line > 0 ? `${i.file}:${i.line}` : i.file
      body.push(`  ${pri} · ${i.dimension} · ${i.message} ${dim(`(${at})`)}`)
    }
  }
  if (report.baseScore !== null && report.projectedScore !== null) {
    body.push('')
    const drop = report.baseScore - report.projectedScore
    body.push(`  ${parchment('Health impact')}  ${pc.bold(`${report.baseScore} → ${report.projectedScore}`)}  ${drop > 0 ? pc.red(`−${drop}`) : pc.green('no change')}`)
  }
  if (report.commentPosted) {
    body.push('')
    body.push(pc.green(`Posted PR review comment on PR #${report.number} (marker ${PR_REVIEW_MARKER})`))
  }

  printCarbonReport({
    title: 'vectalon pr — PR Review Agent',
    verdict: report.verdict,
    lines: body,
    reportPath: jsonPath,
    root,
    done: `PR #${report.number ?? '—'} · ${verdictColor(report.verdict)} — report: ${jsonPath}`,
  })
}
