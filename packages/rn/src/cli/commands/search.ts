/**
 * vectalon search — Semantic Code Search Agent (Roadmap Phase 11, item 096)
 * Business Source License 1.1 (BSL-1.1)
 *
 * Lexical project search with line-pinned results. Reports to
 * docs/vectalon/search/ (gitignored).
 */
import { resolve } from 'path'
import pc from 'picocolors'
import { logger } from '../logger'
import { runSearch, writeSearchReport } from '../../search'

export interface SearchCommandOptions {
  /** The search query. */
  query?: string
  /** Maximum number of results to return. */
  limit?: number
  /** Print machine-readable output. */
  json?: boolean
}

export async function searchCommand(directory: string, options: SearchCommandOptions): Promise<void> {
  const root = resolve(directory || process.cwd())
  const query = options.query ?? ''
  if (!query.trim()) {
    logger.info(pc.red('vectalon search requires a --query <terms> argument.'))
    process.exit(1)
  }
  const report = runSearch(root, query.trim(), options.limit ?? 20)
  const full = { scannedAt: Date.now(), root, ...report }
  const { jsonPath } = writeSearchReport(root, full)

  if (options.json) {
    process.stdout.write(JSON.stringify(full, null, 2) + '\n')
    return
  }

  logger.info(pc.bold(`vectalon search — "${report.query}" (096)`))
  logger.info(`project: ${root} · files scanned: ${report.filesScanned} · hits: ${report.hits.length} · ${report.ms}ms`)
  logger.info('')
  let lastFile = ''
  for (const h of report.hits) {
    if (h.file !== lastFile) {
      logger.info(pc.bold(h.file))
      lastFile = h.file
    }
    logger.info(`  ${pc.dim(String(h.line).padStart(4))}  ${h.text}`)
  }
  logger.info('')
  for (const f of report.findings) {
    logger.info(`  ${pc.dim('•')} [${f.severity}] ${f.id} — ${f.message}`)
  }
  logger.info('')
  logger.info(`Report: ${pc.dim(jsonPath)}`)
}
