import { existsSync, readFileSync, readdirSync, statSync } from 'fs'
import { join, basename, extname } from 'path'
import { ArtifactStore } from '../ArtifactStore'
import { checksum } from '../artifactTypes'
import { reportError } from '../../utils/safe'
import { parseTelemetryContent } from './parsers'
import type { ParsedAnalyticsEvent, ParsedCrash, ParsedTrace, TelemetryEvent, TelemetryIngestResult } from './types'

const TELEMETRY_EXTENSIONS = new Set(['.json', '.jsonl', '.ndjson'])

/** Default directory searched when no explicit path is passed. */
export const DEFAULT_TELEMETRY_DIRS = ['.vectalon/telemetry', 'telemetry']

/**
 * Ingests runtime telemetry exports (Sentry events, Firebase Crashlytics
 * reports, performance traces, analytics events) into the knowledge base as
 * `telemetry` artifacts — deduplicated by event id within a batch and by
 * content checksum across the store.
 */
export class TelemetryIngestionService {
  constructor(private readonly store: ArtifactStore) {}

  ingestDirectory(dir: string): TelemetryIngestResult {
    const result = this.emptyResult()
    if (!existsSync(dir)) return result
    this.walk(dir, result)
    return result
  }

  ingestFile(file: string): TelemetryIngestResult {
    const result = this.emptyResult()
    if (!existsSync(file) || !TELEMETRY_EXTENSIONS.has(extname(file).toLowerCase())) return result
    result.filesScanned = 1
    this.ingestFileInto(file, result)
    return result
  }

  /** Pick the first existing default telemetry directory, if any. */
  static findDefaultDir(root: string): string | null {
    for (const dir of DEFAULT_TELEMETRY_DIRS) {
      const candidate = join(root, dir)
      if (existsSync(candidate)) return candidate
    }
    return null
  }

  private emptyResult(): TelemetryIngestResult {
    return {
      ingestedAt: Date.now(),
      filesScanned: 0,
      events: [],
      crashes: [],
      traces: [],
      analytics: [],
      artifacts: [],
      skipped: 0,
      errors: [],
    }
  }

  private walk(dir: string, result: TelemetryIngestResult): void {
    let entries: string[]
    try {
      entries = readdirSync(dir)
    } catch (err) {
      reportError(err, 'telemetry: reading ingestion directory')
      return
    }
    for (const entry of entries) {
      const fullPath = join(dir, entry)
      let stat: ReturnType<typeof statSync> | null = null
      try {
        stat = statSync(fullPath)
      } catch (err) {
        reportError(err, 'telemetry: statting file')
        continue
      }
      if (stat.isDirectory()) {
        this.walk(fullPath, result)
      } else if (TELEMETRY_EXTENSIONS.has(extname(entry).toLowerCase())) {
        result.filesScanned++
        this.ingestFileInto(fullPath, result)
      }
    }
  }

  private ingestFileInto(file: string, result: TelemetryIngestResult): void {
    let content: string
    try {
      content = readFileSync(file, 'utf-8')
    } catch (err) {
      result.errors.push({ file, error: err instanceof Error ? err.message : String(err) })
      return
    }

    let events: TelemetryEvent[]
    try {
      events = parseTelemetryContent(content)
    } catch (err) {
      result.errors.push({ file, error: err instanceof Error ? err.message : String(err) })
      return
    }

    // A single-object .json export that is not valid JSON is a hard error;
    // JSONL exports tolerate malformed lines by design.
    if (events.length === 0 && extname(file).toLowerCase() === '.json') {
      try {
        JSON.parse(content)
      } catch (err) {
        reportError(err, `telemetry: ${file} is not valid JSON`)
        result.errors.push({ file, error: 'File is not valid JSON' })
        return
      }
    }

    const seenIds = new Set<string>()
    for (const event of events) {
      // Dedupe repeated events within the same batch (e.g. duplicate exports).
      if (event.kind === 'crash' && seenIds.has(event.id)) {
        result.skipped++
        continue
      }
      if (event.kind === 'crash') seenIds.add(event.id)

      const artifact = this.ingestEvent(event, file)
      if (!artifact) {
        result.skipped++
        continue
      }
      result.events.push(event)
      if (event.kind === 'crash') result.crashes.push(event)
      if (event.kind === 'performance') result.traces.push(event)
      if (event.kind === 'analytics') result.analytics.push(event)
      result.artifacts.push({ id: artifact.id, title: artifact.title, type: artifact.type })
    }
  }

  private ingestEvent(event: TelemetryEvent, file: string): { id: string; title: string; type: string } | null {
    const rendered = renderEventMarkdown(event)
    if (this.store.hasChecksum(checksum(rendered))) return null

    const title = eventTitle(event)
    const meta: Record<string, string> = {
      kind: event.kind,
      source: event.source,
      file: basename(file),
      eventId: event.kind === 'crash' ? event.id : '',
      ...(event.kind === 'crash' && event.release ? { release: event.release } : {}),
    }

    const artifact = this.store.add({ type: 'telemetry', title, content: rendered, source: 'import', meta })
    return { id: artifact.id, title: artifact.title, type: artifact.type }
  }
}

function eventTitle(event: TelemetryEvent): string {
  switch (event.kind) {
    case 'crash':
      return `Crash: ${event.exceptionType || event.message || event.id}`
    case 'performance':
      return `Trace: ${event.name}`
    case 'analytics':
      return `Analytics: ${event.name}`
  }
}

/** Render a telemetry event as a markdown artifact for the knowledge base. */
export function renderEventMarkdown(event: TelemetryEvent): string {
  switch (event.kind) {
    case 'crash':
      return renderCrashMarkdown(event)
    case 'performance':
      return renderTraceMarkdown(event)
    case 'analytics':
      return renderAnalyticsMarkdown(event)
  }
}

function renderCrashMarkdown(crash: ParsedCrash): string {
  const lines = [
    `# Crash: ${crash.exceptionType || crash.message || crash.id}`,
    '',
    `- **Source:** ${crash.source}`,
    `- **Event id:** ${crash.id}`,
    crash.timestamp ? `- **Timestamp:** ${new Date(crash.timestamp).toISOString()}` : null,
    crash.release ? `- **Release:** ${crash.release}` : null,
    crash.environment ? `- **Environment:** ${crash.environment}` : null,
    crash.platform ? `- **Platform:** ${crash.platform}` : null,
    crash.fingerprint && crash.fingerprint.length > 0 ? `- **Fingerprint:** ${crash.fingerprint.join(', ')}` : null,
    crash.culprit ? `- **Culprit:** ${crash.culprit}` : null,
    crash.user?.id ? `- **User:** ${crash.user.id}` : null,
    '',
  ].filter((line): line is string => line !== null)

  if (crash.message && crash.message !== crash.exceptionType) {
    lines.push('## Message', '', '```', crash.message, '```', '')
  }

  if (crash.frames.length > 0) {
    lines.push('## Stack frames', '')
    for (const frame of crash.frames.slice(0, 25)) {
      const location = [frame.filename, frame.lineno !== undefined ? `:${frame.lineno}` : ''].join('')
      lines.push(`- ${frame.function || '(anonymous)'} — \`${location}\``)
    }
    if (crash.frames.length > 25) {
      lines.push(`- _… ${crash.frames.length - 25} more frame(s)_`)
    }
    lines.push('')
  }

  return lines.join('\n')
}

function renderTraceMarkdown(trace: ParsedTrace): string {
  const lines = [
    `# Performance trace: ${trace.name}`,
    '',
    `- **Duration:** ${trace.durationMs} ms`,
    trace.op ? `- **Operation:** ${trace.op}` : null,
    trace.startTimestamp ? `- **Started:** ${new Date(trace.startTimestamp).toISOString()}` : null,
    trace.platform ? `- **Platform:** ${trace.platform}` : null,
    trace.release ? `- **Release:** ${trace.release}` : null,
    trace.source ? `- **Source:** ${trace.source}` : null,
  ].filter((line): line is string => line !== null)

  if (trace.spans && trace.spans.length > 0) {
    lines.push('', '## Spans', '')
    for (const span of trace.spans) {
      lines.push(`- ${span.op || 'span'}${span.description ? ` — ${span.description}` : ''}: ${span.durationMs} ms`)
    }
  }
  lines.push('')
  return lines.join('\n')
}

function renderAnalyticsMarkdown(event: ParsedAnalyticsEvent): string {
  const lines = [
    `# Analytics event: ${event.name}`,
    '',
    `- **Source:** ${event.source}`,
    event.timestamp ? `- **Timestamp:** ${new Date(event.timestamp).toISOString()}` : null,
    event.platform ? `- **Platform:** ${event.platform}` : null,
    event.userId ? `- **User:** ${event.userId}` : null,
  ].filter((line): line is string => line !== null)

  if (event.properties && Object.keys(event.properties).length > 0) {
    lines.push('', '## Properties', '')
    for (const [key, value] of Object.entries(event.properties)) {
      lines.push(`- ${key}: ${String(value)}`)
    }
  }
  lines.push('')
  return lines.join('\n')
}
