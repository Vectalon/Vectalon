/**
 * vectalon telemetry — Runtime telemetry ingestion
 * Business Source License 1.1 (BSL-1.1)
 */

import { existsSync, statSync } from 'fs'
import { join, resolve } from 'path'
import { UsageReporter } from '@vectalon/core'
import { logger } from '../logger'
import { ArtifactStore } from '../../knowledge/ArtifactStore'
import { TelemetryIngestionService, DEFAULT_TELEMETRY_DIRS } from '../../knowledge/telemetry'
import { RootCauseAnalyzer } from '../../sdlc/RootCauseAnalyzer'
import { IncidentAnalyzer } from '../../sdlc/IncidentAnalyzer'
import { KpiReportAnalyzer } from '../../sdlc/KpiReportAnalyzer'
import type { ParsedCrash, ParsedTrace, TelemetryIngestResult } from '../../knowledge/telemetry'

interface TelemetryOptions {
  path?: string
  analyze?: boolean
}

/**
 * `vectalon telemetry [directory]` — ingest runtime telemetry exports
 * (Sentry events, Firebase Crashlytics reports, performance traces, analytics
 * events) into the knowledge base, then run data-driven crash / incident /
 * KPI analysis over the ingested window.
 */
export async function telemetryCommand(directory: string, options: TelemetryOptions): Promise<void> {
  const root = resolve(directory || process.cwd())

  if (!existsSync(join(root, '.vectalon'))) {
    logger.error('No .vectalon/ directory found. Run `vectalon init` first.')
    process.exit(1)
  }

  const store = new ArtifactStore(root)
  const service = new TelemetryIngestionService(store)

  const dir = options.path
    ? resolve(root, options.path)
    : TelemetryIngestionService.findDefaultDir(root)

  if (!dir || !existsSync(dir)) {
    logger.warn(`No telemetry exports found. Drop Sentry / Crashlytics / trace / analytics exports into ${DEFAULT_TELEMETRY_DIRS.join(' or ')} (relative to the project root), or pass --path.`)
    return
  }

  const isFile = statSync(dir).isFile()
  const result: TelemetryIngestResult = isFile ? service.ingestFile(dir) : service.ingestDirectory(dir)

  logger.info(`Scanned ${result.filesScanned} telemetry file(s)`)
  logger.success(`Ingested ${result.events.length} event(s): ${result.crashes.length} crash, ${result.traces.length} trace, ${result.analytics.length} analytics`)
  if (result.skipped > 0) logger.dim(`  ${result.skipped} duplicate(s) skipped`)
  for (const error of result.errors) {
    logger.warn(`  ${error.file}: ${error.error}`)
  }

  if (result.events.length === 0) return

  if (options.analyze !== false) {
    runAnalysis(result)
  }

  logger.success(`Telemetry artifacts stored in the knowledge base (${result.artifacts.length} new)`)
}

function runAnalysis(result: TelemetryIngestResult): void {
  const rootCause = new RootCauseAnalyzer()

  if (result.crashes.length > 0) {
    // Top crash by exception type, analyzed with its actual crash facts.
    const counts = new Map<string, ParsedCrash[]>()
    for (const crash of result.crashes) {
      const key = crash.exceptionType || crash.message || crash.id
      const group = counts.get(key) || []
      group.push(crash)
      counts.set(key, group)
    }
    const top = [...counts.entries()].sort((a, b) => b[1].length - a[1].length)[0]

    logger.info('')
    logger.info('Top crash analysis')
    logger.info('------------------')
    const analysis = rootCause.renderCrash(rootCause.analyzeCrash(top[1][0]))
    for (const line of analysis.split('\n')) {
      logger.info(`  ${line}`)
    }

    // Incident-style summary across the whole crash window.
    const incident = new IncidentAnalyzer().analyze({
      title: 'Telemetry crash window',
      description: `${result.crashes.length} crash report(s) ingested`,
      crashes: result.crashes,
      traces: result.traces as ParsedTrace[],
    })
    logger.info('')
    logger.info('Incident summary')
    logger.info('----------------')
    logger.info(`  Severity: ${incident.severity}`)
    logger.info(`  Impact: ${incident.impact}`)
    logger.info(`  Cause bucket: ${incident.causeBucket}`)
    logger.info(`  Probable cause: ${incident.probableCause}`)
  }

  const kpi = new KpiReportAnalyzer().analyzeFromEvents(result.events)
  logger.info('')
  logger.info('Telemetry KPIs')
  logger.info('--------------')
  for (const metric of kpi.metrics) {
    logger.info(`  - ${metric.name}: ${metric.current} (${metric.status})`)
  }

  // Track usage (opt-in only)
  const reporter = new UsageReporter()
  reporter.track('telemetry_ingest', 'rn', undefined, {
    filesScanned: result.filesScanned,
    eventsIngested: result.events.length,
    crashes: result.crashes.length,
    traces: result.traces.length,
    analytics: result.analytics.length,
  })
}
