/**
 * vectalon telemetry --watch — ingest telemetry exports as they land.
 * Business Source License 1.1 (BSL-1.1)
 *
 * The watcher polls a telemetry directory (default `.vectalon/telemetry`),
 * re-ingests only files whose mtime/size changed since the last pass, and
 * reports each non-empty delta through an `onDelta` callback so callers can
 * print live crash/incident/KPI analysis. Two layers prevent duplicate
 * artifacts: the per-file state below (avoids re-parsing unchanged files) and
 * the TelemetryIngestionService's content-checksum dedupe against the store
 * (belt-and-suspenders — even a lost state file can never double-store).
 *
 * The state lives OUTSIDE the watched directory
 * (`.vectalon/telemetry-watch-state.json`), so the ingest walk never sees it.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'fs'
import { extname, join, relative } from 'path'
import { reportError } from '../../utils/safe'
import { ArtifactStore } from '../ArtifactStore'
import { TelemetryIngestionService } from './TelemetryIngestionService'
import type {
  ParsedCrash,
  TelemetryFormat,
  TelemetryIngestResult,
} from './types'

const TELEMETRY_EXTENSIONS = new Set(['.json', '.jsonl', '.ndjson'])

/** Default CLI watch poll cadence. */
export const TELEMETRY_WATCH_DEFAULT_INTERVAL_MS = 10_000

/** Name of the per-file scan state (kept outside the watched directory). */
export const TELEMETRY_WATCH_STATE_FILENAME = 'telemetry-watch-state.json'

type WatchLog = { info: (m: string) => void; warn: (m: string) => void; debug: (m: string) => void }

/** mtime+size fingerprint of one scanned file. */
export interface WatchFileState {
  mtimeMs: number
  size: number
}

/** Relative-path → fingerprint, persisted so restarts skip already-seen files. */
export type TelemetryWatchState = Record<string, WatchFileState>

/** Result of one watch pass — a normal ingest result plus the files that changed. */
export interface TelemetryWatchDelta extends TelemetryIngestResult {
  /** Relative paths of files that were (re)ingested this pass. */
  changedFiles: string[]
}

export interface TelemetryWatcherOptions {
  root: string
  /**
   * Directory to watch. Defaults to the first existing default telemetry dir
   * (`.vectalon/telemetry` / `telemetry`) — re-resolved each pass, so a dir
   * created after startup is picked up automatically.
   */
  dir?: string
  /** Force a telemetry format for every ingested file. */
  format?: TelemetryFormat
  /** Poll cadence (default `TELEMETRY_WATCH_DEFAULT_INTERVAL_MS`). */
  intervalMs?: number
  /** State file path (default `.vectalon/telemetry-watch-state.json`). */
  statePath?: string
  /** Unref the poll interval so it never keeps the process alive alone. */
  unref?: boolean
  /** Called once per pass when new events were ingested (never for empty passes). */
  onDelta?: (delta: TelemetryWatchDelta) => void
  log?: WatchLog
}

export interface TelemetryWatcher {
  /** Run an initial pass, then poll every intervalMs. Idempotent. */
  start(): void
  /** Stop polling. The current pass (if running) is unaffected. */
  stop(): void
  /** Run one pass synchronously — returns the delta, or null when nothing changed. */
  poll(): TelemetryWatchDelta | null
}

const NOOP_LOG: WatchLog = { info: () => undefined, warn: () => undefined, debug: () => undefined }

/** Default location of the per-file scan state. */
export function telemetryWatchStatePath(root: string): string {
  return join(root, '.vectalon', TELEMETRY_WATCH_STATE_FILENAME)
}

/** Recursively list telemetry files (`.json` / `.jsonl` / `.ndjson`), skipping dotfiles. */
export function scanTelemetryFiles(dir: string): string[] {
  const out: string[] = []
  const walk = (current: string): void => {
    let entries: string[]
    try {
      entries = readdirSync(current)
    } catch (err) {
      reportError(err, 'telemetry watch: reading directory')
      return
    }
    for (const entry of entries) {
      if (entry.startsWith('.')) continue
      const full = join(current, entry)
      let stat: ReturnType<typeof statSync> | null = null
      try {
        stat = statSync(full)
      } catch (err) {
        reportError(err, 'telemetry watch: statting file')
        continue
      }
      if (stat.isDirectory()) {
        walk(full)
      } else if (TELEMETRY_EXTENSIONS.has(extname(entry).toLowerCase())) {
        out.push(full)
      }
    }
  }
  walk(dir)
  return out.sort()
}

/** Read the persisted scan state; tolerant of a missing or corrupt file. */
export function readTelemetryWatchState(path: string): TelemetryWatchState {
  try {
    if (!existsSync(path)) return {}
    const raw = JSON.parse(readFileSync(path, 'utf-8')) as unknown
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      const out: TelemetryWatchState = {}
      for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
        const v = value as WatchFileState
        if (v && typeof v.mtimeMs === 'number' && typeof v.size === 'number') {
          out[key] = { mtimeMs: v.mtimeMs, size: v.size }
        }
      }
      return out
    }
  } catch (err) {
    reportError(err, 'telemetry watch: reading state file (starting fresh)')
  }
  return {}
}

/** Persist the scan state (best-effort; a read-only project never breaks the loop). */
export function writeTelemetryWatchState(path: string, state: TelemetryWatchState): void {
  try {
    mkdirSync(join(path, '..'), { recursive: true })
    writeFileSync(path, JSON.stringify(state, null, 2))
  } catch (err) {
    reportError(err, 'telemetry watch: writing state file')
  }
}

function emptyDelta(): TelemetryWatchDelta {
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
    changedFiles: [],
  }
}

function mergeIntoDelta(delta: TelemetryWatchDelta, result: TelemetryIngestResult, file: string): void {
  delta.filesScanned += result.filesScanned
  delta.events.push(...result.events)
  delta.crashes.push(...result.crashes)
  delta.traces.push(...result.traces)
  delta.analytics.push(...result.analytics)
  delta.artifacts.push(...result.artifacts)
  delta.skipped += result.skipped
  delta.errors.push(...result.errors)
  if (result.events.length > 0) delta.changedFiles.push(file)
}

/**
 * Create a telemetry watcher for `root`. `poll()` is synchronous and safe to
 * call directly (tests call it with no timer); `start()` runs an initial pass
 * then polls on an interval.
 */
export function createTelemetryWatcher(options: TelemetryWatcherOptions): TelemetryWatcher {
  const log = options.log || NOOP_LOG
  const root = options.root
  const statePath = options.statePath ?? telemetryWatchStatePath(root)
  const intervalMs = options.intervalMs ?? TELEMETRY_WATCH_DEFAULT_INTERVAL_MS
  const store = new ArtifactStore(root)
  const service = new TelemetryIngestionService(store)

  let timer: ReturnType<typeof setInterval> | null = null

  const resolveDir = (): string | null => options.dir ?? TelemetryIngestionService.findDefaultDir(root)

  const poll = (): TelemetryWatchDelta | null => {
    const dir = resolveDir()
    if (!dir || !existsSync(dir)) {
      log.debug('telemetry watch: watched directory not present yet')
      return null
    }
    const files = scanTelemetryFiles(dir)
    const state = readTelemetryWatchState(statePath)
    const delta = emptyDelta()
    let stateDirty = false
    const seen = new Set<string>()

    for (const file of files) {
      const key = relative(root, file)
      seen.add(key)
      let stat: ReturnType<typeof statSync>
      try {
        stat = statSync(file)
      } catch (err) {
        reportError(err, 'telemetry watch: statting file')
        continue
      }
      const previous = state[key]
      if (previous && previous.mtimeMs === stat.mtimeMs && previous.size === stat.size) {
        continue // unchanged since the last pass — nothing to do
      }
      const result = service.ingestFile(file, { format: options.format })
      mergeIntoDelta(delta, result, file)
      state[key] = { mtimeMs: stat.mtimeMs, size: stat.size }
      stateDirty = true
    }

    // Forget files that disappeared so a re-created file re-ingests.
    for (const key of Object.keys(state)) {
      if (!seen.has(key)) {
        delete state[key]
        stateDirty = true
      }
    }
    if (stateDirty) writeTelemetryWatchState(statePath, state)

    if (delta.events.length === 0) return null
    delta.ingestedAt = Date.now()
    options.onDelta?.(delta)
    return delta
  }

  return {
    start(): void {
      if (timer) return
      try {
        poll()
      } catch (err) {
        reportError(err, 'telemetry watch: initial pass')
      }
      timer = setInterval(() => {
        try {
          poll()
        } catch (err) {
          reportError(err, 'telemetry watch: poll pass')
        }
      }, intervalMs)
      if (options.unref && timer.unref) timer.unref()
    },
    stop(): void {
      if (timer) {
        clearInterval(timer)
        timer = null
      }
    },
    poll,
  }
}

/**
 * Compact one-screen summary of a delta — the daemon's live surface ("2 new
 * crashes, top exception, slowest trace"). Kept dependency-light: counts +
 * top items only, no analyzers.
 */
export function renderDeltaSummary(delta: TelemetryIngestResult): string[] {
  const lines: string[] = [
    `Telemetry: ${delta.events.length} new event(s) — ${delta.crashes.length} crash, ${delta.traces.length} trace, ${delta.analytics.length} analytics`,
  ]

  if (delta.crashes.length > 0) {
    const byType = new Map<string, ParsedCrash[]>()
    for (const crash of delta.crashes) {
      const key = crash.exceptionType || crash.message || crash.id
      const group = byType.get(key) || []
      group.push(crash)
      byType.set(key, group)
    }
    for (const [type, crashes] of [...byType.entries()].slice(0, 3)) {
      const releases = [...new Set(crashes.map(c => c.release).filter((r): r is string => !!r))]
      const suffix = releases.length > 0 ? ` (${releases.join(', ')})` : ''
      lines.push(`  Crash: ${type}${suffix} — ${crashes.length} report(s)`)
    }
  }

  if (delta.traces.length > 0) {
    for (const trace of delta.traces.slice(0, 3)) {
      lines.push(`  Trace: ${trace.name} — ${trace.durationMs} ms`)
    }
  }

  if (delta.analytics.length > 0) {
    const byName = new Map<string, number>()
    for (const event of delta.analytics) {
      byName.set(event.name, (byName.get(event.name) || 0) + 1)
    }
    for (const [name, count] of [...byName.entries()].slice(0, 3)) {
      lines.push(`  Analytics: ${name} x${count}`)
    }
  }

  return lines
}
