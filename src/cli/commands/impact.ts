import { resolve } from 'path'
import { logger } from '../logger'
import { analyzeCrossPackageImpact, renderImpactReport } from '../../harness'
import { createAdapters } from '../../adapters'

interface ImpactOptions {
  changed?: string
  pr?: number
  push?: boolean
  json?: boolean
  dryRun?: boolean
}

/**
 * `vectalon impact [directory] --changed <files> [--pr <number>]`
 *
 * Compute the cross-package blast radius of changed files in a workspace and
 * (optionally) post the report as a PR comment.
 */
export async function impactCommand(directory: string, options: ImpactOptions): Promise<void> {
  const root = resolve(directory || process.cwd())
  const changed = ((options.changed || '').split(',')).map(s => s.trim()).filter(Boolean)

  if (changed.length === 0) {
    logger.error('Pass --changed with a comma-separated list of changed file paths (relative to the workspace root).')
    process.exit(1)
  }

  const impact = analyzeCrossPackageImpact(root, changed)
  const content = renderImpactReport(impact)

  if (options.json) {
    logger.out(JSON.stringify(impact, null, 2) + '\n')
    return
  }

  logger.out(content + '\n')

  if (typeof options.pr === 'number') {
    const adapters = createAdapters({ root, dryRun: options.dryRun === true, git: { push: options.push === true } })
    await adapters.git.commentPullRequest(options.pr, content)
  }
}
