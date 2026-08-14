/**
 * vectalon diagnostics — Project Diagnostics (Roadmap 011-015): Metro config,
 * Hermes compatibility, Android (Gradle) build analysis, iOS (Xcode) build
 * analysis, and dependency conflict detection in one deterministic pass.
 * Business Source License 1.1 (BSL-1.1)
 */
import { resolve } from 'path'
import pc from 'picocolors'
import { logger } from '../logger'
import { runProjectDiagnostics, renderDiagnosticsMarkdown, summarizeDiagnostics, writeDiagnosticsReport } from '../../projectDiagnostics'

export interface DiagnosticsOptions {
  json?: boolean
  gradleLog?: string
  xcodeLog?: string
}

export async function diagnosticsCommand(directory: string, options: DiagnosticsOptions): Promise<void> {
  const root = resolve(directory || process.cwd())
  logger.info(pc.bold('vectalon diagnostics — Project Diagnostics'))
  logger.info(`project: ${root}`)
  logger.info('')

  const report = runProjectDiagnostics(root, {
    gradleLog: options.gradleLog,
    xcodeLog: options.xcodeLog,
  })

  const { jsonPath } = writeDiagnosticsReport(root, report)

  if (options.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n')
    return
  }

  process.stdout.write(renderDiagnosticsMarkdown(report) + '\n')
  logger.info('')
  for (const line of summarizeDiagnostics(report)) {
    logger.info(line)
  }
  logger.success(`report.json + report.md written to ${pc.dim(jsonPath.slice(0, jsonPath.lastIndexOf('/')))}`)
}
