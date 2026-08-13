import { resolve } from 'path'
import { logger } from '../logger'
import { analyzeCrossPackageImpact, renderImpactReport, writeImpactDoc } from '../../harness'
import { createAdapters } from '../../adapters'

interface ImpactOptions {
  changed?: string
  pr?: number
  push?: boolean
  json?: boolean
  dryRun?: boolean
  /** Write the report doc to this directory instead of docs/vectalon/impact. */
  out?: string
}

/**
 * `vectalon impact [directory] --changed <files> [--pr <number>]`
 *
 * Compute the cross-package blast radius of changed files in a workspace,
 * persist the report as a tracked doc under `docs/vectalon/impact/`, and
 * (optionally) post it as a PR comment. `--changed` accepts file paths OR
 * screen / component / route names — `NewRequestSubmitScreen` resolves to the
 * file that defines it.
 */
export async function impactCommand(directory: string, options: ImpactOptions): Promise<void> {
  const root = resolve(directory || process.cwd())
  const changed = ((options.changed || '').split(',')).map(s => s.trim()).filter(Boolean)

  if (changed.length === 0) {
    logger.error('Pass --changed with a comma-separated list of changed file paths or screen/component names (relative to the workspace root).')
    process.exit(1)
  }

  const impact = analyzeCrossPackageImpact(root, changed)
  const content = renderImpactReport(impact)

  if (options.json) {
    logger.out(JSON.stringify(impact, null, 2) + '\n')
    return
  }

  logger.out(content + '\n')

  // Persist the report so the analysis is reviewable and versioned — skipped
  // only for dry runs (which simulate the PR comment instead).
  if (options.dryRun !== true) {
    const docDir = options.out ? resolve(root, options.out) : undefined
    const docPath = writeImpactDoc(root, impact, content, docDir)
    logger.info(`Impact doc: ${docPath.replace(resolve(root) + '/', '')}`)
  }

  if (typeof options.pr === 'number') {
    const adapters = createAdapters({ root, dryRun: options.dryRun === true, git: { push: options.push === true } })
    await adapters.git.commentPullRequest(options.pr, content)
  }
}
