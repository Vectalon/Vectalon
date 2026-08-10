import { existsSync, readFileSync } from 'fs'
import { join, resolve } from 'path'
import { logger } from '../logger'
import { KnowledgeRefreshService } from '../../knowledge/refresh'
import { maintainKnowledgeBase } from '../../knowledge'

interface RefreshOptions {
  force?: boolean
}

export async function refreshCommand(directory: string, options: RefreshOptions): Promise<void> {
  const root = resolve(directory || process.cwd())
  const vectalonDir = join(root, '.vectalon')

  if (!existsSync(vectalonDir)) {
    logger.error('No .vectalon/ directory found. Run `vectalon init` first.')
    process.exit(1)
  }

  const service = new KnowledgeRefreshService({ projectRoot: root })

  if (!options.force && !service.isStale()) {
    logger.info('Knowledge is up to date. Use --force to refresh anyway.')
    const suggestions = service.getSuggestions()
    if (suggestions.length > 0) {
      logger.info(`${suggestions.length} improvement suggestion(s) on file.`)
    }
    return
  }

  const packageJsonPath = join(root, 'package.json')
  let dependencies: Record<string, string> = {}
  let devDependencies: Record<string, string> = {}

  if (existsSync(packageJsonPath)) {
    try {
      const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf-8'))
      dependencies = pkg.dependencies || {}
      devDependencies = pkg.devDependencies || {}
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      logger.warn(`Could not read package.json: ${message}`)
    }
  }

  logger.info('Refreshing knowledge from web sources...')
  const result = await service.refresh({
    projectRoot: root,
    dependencies,
    devDependencies,
    force: options.force,
  })

  const sourceCount = new Set(result.documents.map(d => d.sourceId)).size
  logger.info(`Fetched ${result.documents.length} document(s) from ${sourceCount} source(s)`)
  if (result.errors.length > 0) {
    logger.warn(`${result.errors.length} source(s) failed`)
    for (const error of result.errors) {
      logger.warn(`  ${error.sourceId}: ${error.error}`)
    }
  }

  if (result.suggestions.length > 0) {
    logger.info(`${result.suggestions.length} improvement suggestion(s) generated`)
    for (const suggestion of result.suggestions) {
      const icon = suggestion.severity === 'error' ? '❌' : suggestion.severity === 'warning' ? '⚠️' : 'ℹ️'
      logger.info(`  ${icon} ${suggestion.title}`)
      logger.dim(`     ${suggestion.description}`)
    }
  } else {
    logger.info('No improvement suggestions at this time')
  }

  // Web intel keeps the model current — surface the headlines it just collected.
  if (result.intel.length > 0) {
    logger.info(`${result.intel.length} web intel headline(s) — the model system prompt now reflects the latest RN ecosystem`)
    for (const item of result.intel.slice(0, 8)) {
      const date = item.publishedAt ? ` (${item.publishedAt.slice(0, 10)})` : ''
      logger.dim(`  • ${item.title}${date} — ${item.sourceName}`)
    }
    if (result.intel.length > 8) logger.dim(`  … ${result.intel.length - 8} more`)
  } else {
    logger.info('No web intel headlines collected this refresh')
  }

  // Knowledge maintenance is Vectalon's responsibility: re-scan the repo and
  // re-seed the repo-derived artifacts (idempotent) so the knowledge base
  // tracks code changes even when nothing changed upstream.
  try {
    const seeded = maintainKnowledgeBase(root)
    logger.info(`Knowledge base maintained from repo scan (${seeded.total} artifact(s), ${seeded.updated} refreshed)`)
  } catch (err) {
    logger.warn(`Repo-scan knowledge maintenance failed: ${err instanceof Error ? err.message : String(err)}`)
  }
}
