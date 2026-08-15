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
import { printCarbonReport, dim } from '../carbon'
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

  const body: string[] = []
  body.push(`files scanned: ${report.filesScanned} · hits: ${report.hits.length} · ${report.ms}ms`)
  body.push('')
  let lastFile = ''
  for (const h of report.hits) {
    if (h.file !== lastFile) {
      body.push(pc.bold(h.file))
      lastFile = h.file
    }
    body.push(`  ${dim(String(h.line).padStart(4))}  ${h.text}`)
  }
  body.push('')
  for (const f of report.findings) {
    body.push(`  ${dim('•')} [${f.severity}] ${f.id} — ${f.message}`)
  }

  printCarbonReport({
    title: `vectalon search — "${report.query}" (096)`,
    verdict: report.verdict,
    lines: body,
    reportPath: jsonPath,
    root,
  })
}
