/**
 * vectalon telemetry — Runtime telemetry ingestion
 * Business Source License 1.1 (BSL-1.1)
 */

import { existsSync, statSync } from 'fs'
import { join, resolve } from 'path'
import { UsageReporter } from '@vectalon-dev/core'
import { logger } from '../logger'
import { ArtifactStore } from '../../knowledge/ArtifactStore'
import { TelemetryIngestionService, DEFAULT_TELEMETRY_DIRS } from '../../knowledge/telemetry'
import { writeTelemetryFixtures } from '../../knowledge/telemetry/fixtures'
import { telemetryFormatsGuide, isTelemetryFormat } from '../../knowledge/telemetry/formats'
import { RootCauseAnalyzer } from '../../sdlc/RootCauseAnalyzer'
import { IncidentAnalyzer } from '../../sdlc/IncidentAnalyzer'
import { KpiReportAnalyzer } from '../../sdlc/KpiReportAnalyzer'
import type { ParsedCrash, ParsedTrace, TelemetryFormat, TelemetryIngestResult } from '../../knowledge/telemetry'

interface TelemetryOptions {
  path?: string
  analyze?: boolean
  /** Write sample Sentry/Crashlytics/analytics exports, then ingest them. */
  fixtures?: boolean
  /** Force a telemetry format instead of auto-detecting per record. */
  format?: string
  /** Print the accepted formats guide and exit. */
  formats?: boolean
}

/**
 * What the command actually did — so callers (the interactive menu, the CLI
 * wrapper) can stop claiming success when nothing was ingested.
 */
export type TelemetryCommandOutcome =
  | { status: 'ingested'; result: TelemetryIngestResult }
  | { status: 'empty'; reason: 'no-dir-found' | 'no-parseable-events' }
  | { status: 'formats' }

/**
 * `vectalon telemetry [directory]` — ingest runtime telemetry exports
 * (Sentry events, Firebase Crashlytics reports, performance traces, analytics
 * events) into the knowledge base, then run data-driven crash / incident /
 * KPI analysis over the ingested window.
 *
 * Never calls process.exit for the empty case: it returns an outcome so the
 * interactive menu can guide the user and the CLI wrapper can set the exit
 * code. The only hard exit is the pre-flight ".vectalon missing" error.
 */
export async function telemetryCommand(directory: string, options: TelemetryOptions): Promise<TelemetryCommandOutcome> {
  if (options.formats) {
    logger.out(telemetryFormatsGuide())
    return { status: 'formats' }
  }

  if (options.fixtures && options.path) {
    logger.error('--fixtures writes and ingests sample exports; it cannot be combined with --path (run one or the other)')
    process.exit(1)
  }

  if (options.format !== undefined && !isTelemetryFormat(options.format)) {
    logger.error(`Unknown telemetry format: ${options.format}. Valid formats: sentry, crashlytics, performance, analytics`)
    process.exit(1)
  }

  const root = resolve(directory || process.cwd())

  if (!existsSync(join(root, '.vectalon'))) {
    logger.error('No .vectalon/ directory found. Run `vectalon init` first.')
    process.exit(1)
  }

  const store = new ArtifactStore(root)
  const service = new TelemetryIngestionService(store)
  const format = options.format as TelemetryFormat | undefined

  if (options.fixtures) {
    const written = writeTelemetryFixtures(root)
    logger.info(`Sample exports written (${written.length} files): ${written.map(p => p.split('/').pop()).join(', ')}`)
    const result = service.ingestDirectory(join(root, '.vectalon', 'telemetry'), { format })
    reportIngest(result)
    if (result.events.length === 0) return { status: 'empty', reason: 'no-parseable-events' }
    if (options.analyze !== false) runAnalysis(result)
    logger.success(`Sample telemetry ingested — the pipeline works end-to-end. Try it on your own exports.`)
    return { status: 'ingested', result }
  }

  const dir = options.path
    ? resolve(root, options.path)
    : TelemetryIngestionService.findDefaultDir(root)

  if (!dir || !existsSync(dir)) {
    logger.warn(`No telemetry exports found. Drop Sentry / Crashlytics / trace / analytics exports into ${DEFAULT_TELEMETRY_DIRS.join(' or ')} (relative to the project root), pass --path, or run --fixtures to write sample exports and see the pipeline end-to-end.`)
    return { status: 'empty', reason: 'no-dir-found' }
  }

  const isFile = statSync(dir).isFile()
  const result: TelemetryIngestResult = isFile
    ? service.ingestFile(dir, { format })
    : service.ingestDirectory(dir, { format })
  reportIngest(result)

  if (result.events.length === 0) {
    logger.warn(`Scanned ${result.filesScanned} file(s) but parsed no events. If the exports look right, the format may be unusual — retry with --format <sentry|crashlytics|performance|analytics>.`)
    return { status: 'empty', reason: 'no-parseable-events' }
  }

  if (options.analyze !== false) {
    runAnalysis(result)
  }

  logger.success(`Telemetry artifacts stored in the knowledge base (${result.artifacts.length} new)`)
  return { status: 'ingested', result }
}

/** Shared post-ingest reporting (used by the normal and fixture paths). */
function reportIngest(result: TelemetryIngestResult): void {
  logger.info(`Scanned ${result.filesScanned} telemetry file(s)`)
  logger.success(`Ingested ${result.events.length} event(s): ${result.crashes.length} crash, ${result.traces.length} trace, ${result.analytics.length} analytics`)
  if (result.skipped > 0) logger.dim(`  ${result.skipped} duplicate(s) skipped`)
  for (const error of result.errors) {
    logger.warn(`  ${error.file}: ${error.error}`)
  }
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
