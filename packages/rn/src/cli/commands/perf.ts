/**
 * vectalon perf — static render-performance scan (Roadmap Phase 4, items
 * 021-023, 027, 029): re-render hazards, startup hot paths, and legacy bridge
 * traffic in one deterministic pass, with severity-ranked recommendations.
 * Business Source License 1.1 (BSL-1.1)
 */
import { resolve } from 'path'
import pc from 'picocolors'
import { logger } from '../logger'
import { runPerfScan, renderPerfMarkdown, writePerfReport } from '../../perfScan'

export interface PerfOptions {
  json?: boolean
}

export async function perfCommand(directory: string, options: PerfOptions): Promise<void> {
  const root = resolve(directory || process.cwd())
  logger.info(pc.bold('vectalon perf — static performance scan'))
  logger.info(`project: ${root}`)
  logger.info('')

  const report = runPerfScan(root)
  const { jsonPath } = writePerfReport(root, report)

  if (options.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n')
    return
  }

  process.stdout.write(renderPerfMarkdown(report) + '\n')
  logger.info('')
  for (const line of report.summary.topRecommendations) {
    logger.info(`→ ${line}`)
  }
  logger.success(`report.json + report.md written to ${pc.dim(jsonPath.slice(0, jsonPath.lastIndexOf('/')))}`)
}
