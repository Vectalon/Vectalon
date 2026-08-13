import { resolve } from 'path'
import { logger } from '../logger'
import {
  coverageGapsDocPath,
  readCoverageGapsDoc,
  parseCoverageGapsDoc,
  summarizeCoverageGaps,
} from '../../harness'

interface CoverageOptions {
  json?: boolean
  limit?: number
}

/**
 * `vectalon coverage [directory] [--json] [--limit <n>]`
 *
 * Render the committed coverage dashboard (`docs/vectalon/coverage/coverage-gaps.md`)
 * as a per-screen summary of E2E and accessibility gaps, with links to the
 * open follow-up tasks when the PM provider recorded URLs. The dashboard is
 * appended by the close phase of each feature workflow run, so this command is
 * how a team reads the accumulated gap history.
 */
export async function coverageCommand(directory: string, options: CoverageOptions): Promise<void> {
  const root = resolve(directory || process.cwd())
  const docPath = coverageGapsDocPath(root)
  const relativeDoc = docPath.replace(resolve(root) + '/', '')
  const markdown = readCoverageGapsDoc(root)

  if (!markdown) {
    logger.info(`No coverage dashboard yet — run the feature workflow so the close phase records E2E and accessibility gaps (${relativeDoc}).`)
    return
  }

  const entries = parseCoverageGapsDoc(markdown)
  let summary = summarizeCoverageGaps(entries)
  const limit = typeof options.limit === 'number' && options.limit > 0 ? options.limit : summary.length
  summary = summary.slice(0, limit)

  if (options.json) {
    logger.out(JSON.stringify({ docPath: relativeDoc, entries: entries.length, screens: summary }, null, 2) + '\n')
    return
  }

  const firstDate = entries[0]?.date
  const lastDate = entries[entries.length - 1]?.date
  const lines: string[] = []
  lines.push('# Coverage gaps — E2E and accessibility')
  lines.push('')
  lines.push(`Doc: \`${relativeDoc}\` — ${entries.length} run(s)` + (firstDate && lastDate ? ` (${firstDate} → ${lastDate})` : ''))
  lines.push('')
  lines.push('## Per-screen summary')
  lines.push('')
  if (summary.length === 0) {
    lines.push('No per-screen gaps recorded.')
  } else {
    lines.push('| Screen | E2E runs | a11y runs | Latest follow-up |')
    lines.push('|---|---|---|---|')
    for (const s of summary) {
      const followUp = s.followUpTaskId
        ? s.followUpTaskUrl
          ? `[\`${s.followUpTaskId}\`](${s.followUpTaskUrl})${s.alreadyTracked ? ' (tracked)' : ''}`
          : `\`${s.followUpTaskId}\`${s.alreadyTracked ? ' (tracked)' : ''}`
        : s.alreadyTracked
          ? 'already tracked (open task exists)'
          : '—'
      lines.push(`| ${s.screen} | ${s.e2eRuns} | ${s.a11yRuns} | ${followUp} |`)
    }
  }
  lines.push('')
  lines.push(`_Last updated ${lastDate || 'n/a'} — the dashboard is appended by the close phase of each feature run._`)
  logger.out(lines.join('\n') + '\n')
}
