/**
 * vectalon telemetry — Runtime telemetry ingestion
 * Business Source License 1.1 (BSL-1.1)
 */

import { existsSync, statSync } from 'fs'
import { join, relative, resolve } from 'path'
import { UsageReporter } from '@vectalon-dev/core'
import { logger } from '../logger'
import { ArtifactStore } from '../../knowledge/ArtifactStore'
import { TelemetryIngestionService, DEFAULT_TELEMETRY_DIRS } from '../../knowledge/telemetry'
import { writeTelemetryFixtures } from '../../knowledge/telemetry/fixtures'
import { telemetryFormatsGuide, isTelemetryFormat } from '../../knowledge/telemetry/formats'
import { createTelemetryWatcher, TELEMETRY_WATCH_DEFAULT_INTERVAL_MS } from '../../knowledge/telemetry/watch'
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
  /** Keep watching the telemetry directory and ingest new exports as they land. */
  watch?: boolean
  /** Watch poll interval in ms (default 10000). */
  interval?: number
}

/**
 * What the command actually did — so callers (the interactive menu, the CLI
 * wrapper) can stop claiming success when nothing was ingested.
 */
export type TelemetryCommandOutcome =
  | { status: 'ingested'; result: TelemetryIngestResult }
  | { status: 'empty'; reason: 'no-dir-found' | 'no-parseable-events' }
  | { status: 'formats' }
  | { status: 'watch' }

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

  if (options.watch && options.fixtures) {
    logger.error('--fixtures writes samples and exits; it cannot be combined with --watch (run one or the other)')
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

  // --watch starts the loop even when the directory is currently empty — the
  // point is to ingest exports as they land, not to fail on an empty start.
  if (options.watch) {
    await runWatchLoop(root, dir, options)
    return { status: 'watch' }
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

/**
 * `--watch` branch: ingest whatever is already in the directory, then poll it
 * and print the delta analysis for every batch of new exports until Ctrl-C.
 * Never hard-exits on empty — an existing directory is required (consistent
 * with the non-watch path), but a directory that exists with zero events is
 * fine: the loop just keeps watching.
 */
async function runWatchLoop(root: string, dir: string, options: TelemetryOptions): Promise<void> {
  const format = options.format as TelemetryFormat | undefined
  // Guard commander's Number coercion: `--interval abc` arrives as NaN, which
  // setInterval would treat as a 1 ms busy-loop (same fix as --timeout in
  // sandbox/render). Fall back to the default when not a positive number.
  const intervalMs =
    typeof options.interval === 'number' && Number.isFinite(options.interval) && options.interval > 0
      ? options.interval
      : TELEMETRY_WATCH_DEFAULT_INTERVAL_MS
  const watcher = createTelemetryWatcher({
    root,
    dir,
    format,
    intervalMs,
    log: logger,
    onDelta: delta => {
      reportIngest(delta)
      if (options.analyze !== false) {
        runAnalysis(delta)
      }
      logger.dim(`Waiting for new exports… (Ctrl-C to stop)`)
    },
  })

  logger.info(`Watching ${relative(root, dir) || dir} for telemetry exports — Ctrl-C to stop`)
  watcher.start()
  await waitForStopSignal()
  watcher.stop()
  logger.success('Telemetry watch stopped')
}

/** Resolve on SIGINT/SIGTERM so the watch loop can exit gracefully. */
function waitForStopSignal(): Promise<'SIGINT' | 'SIGTERM'> {
  return new Promise(resolve => {
    const onSignal = (signal: 'SIGINT' | 'SIGTERM'): void => {
      process.removeListener('SIGINT', onInt)
      process.removeListener('SIGTERM', onTerm)
      resolve(signal)
    }
    const onInt = (): void => onSignal('SIGINT')
    const onTerm = (): void => onSignal('SIGTERM')
    process.once('SIGINT', onInt)
    process.once('SIGTERM', onTerm)
  })
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
