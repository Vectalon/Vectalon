import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { ArtifactStore } from '../knowledge/ArtifactStore'
import { logger } from '../cli/logger'
import { reportError } from '../utils/safe'
import { createTelemetryWatcher, renderDeltaSummary } from '../knowledge/telemetry/watch'
import type { TelemetryWatcher } from '../knowledge/telemetry/watch'
import { DaemonServer } from './daemonServer'
import { MetroEventHandler } from './metroEvents'
import { runProbeCycle, defaultWsFactory } from './hermesProbe'
import type { ProbeResult } from './types'
import type { WsCtor } from './hermesProbe'
import type { DaemonStatus } from './types'
import { writeMetroReporter, hasMetroReporter, metroReporterPath } from './metroReporter'
import { wireMetroReporter } from './metroWiring'

export interface DaemonStateFile {
  port: number
  pid: number
  startedAt: number
}

export interface StartDaemonOptions {
  /** Daemon HTTP port (default 0 = auto-assign; written to daemon.json). */
  port?: number
  /** Metro dev-server port used by the Hermes probe (default 8081). */
  metroPort?: number
  /** Enable the Hermes JS-thread probe loop (default true). */
  deviceProbe?: boolean
  /** Patch metro.config.js to use the generated reporter (default false). */
  wireMetro?: boolean
  /** Watch telemetry exports (.vectalon/telemetry) and ingest new crashes as they land (default false). */
  telemetryWatch?: boolean
  /** Telemetry watch poll cadence (default 30 s — the daemon is not latency-critical). */
  telemetryWatchIntervalMs?: number
  log?: typeof logger
  /** Injectable WebSocket constructor factory (default: the `ws` package). */
  wsFactory?: () => Promise<WsCtor>
  fetchFn?: typeof fetch
}

export const PROBE_INTERVAL_MS = 30_000

export function daemonStatePath(root: string): string {
  return join(root, '.vectalon', 'daemon.json')
}

/** Read the daemon state file; null when absent or malformed. */
export function readDaemonState(root: string): DaemonStateFile | null {
  try {
    const file = daemonStatePath(root)
    if (!existsSync(file)) return null
    const state = JSON.parse(readFileSync(file, 'utf-8')) as DaemonStateFile
    if (typeof state.port !== 'number' || typeof state.pid !== 'number') return null
    return state
  } catch (err) {
    reportError(err, 'daemon: reading state file')
    return null
  }
}

function writeDaemonState(root: string, state: DaemonStateFile): void {
  try {
    mkdirSync(join(root, '.vectalon'), { recursive: true })
    writeFileSync(daemonStatePath(root), JSON.stringify(state, null, 2))
  } catch (err) {
    reportError(err, 'daemon: writing state file')
  }
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (err) {
    return false
  }
}

/**
 * Start the daemon: write the Metro reporter, open the HTTP endpoint, kick off
 * the Hermes probe loop, and record the state file so `--stop`/`--status` and
 * the generated reporter can find it. Resolves once the server is listening;
 * the process stays alive via the server + interval handles.
 */
export async function startDaemon(
  root: string,
  options: StartDaemonOptions = {}
): Promise<{ port: number; close: () => void }> {
  const log = options.log || logger

  // Refuse to double-run: a live state file means another daemon owns the
  // reporter + knowledge-base writes. Stop it first.
  const existing = readDaemonState(root)
  if (existing && pidAlive(existing.pid)) {
    throw new Error(
      `A vectalon daemon is already running (pid ${existing.pid}, port ${existing.port}). Stop it with \`vectalon daemon --stop\` first.`
    )
  }
  // P2-16: the state file says a daemon ran but its pid is dead — stale state
  // from a crash. Wipe it so a fresh daemon starts clean (no phantom owner).
  if (existing && !pidAlive(existing.pid)) {
    log.warn(`Stale daemon state (pid ${existing.pid} is dead) — clearing ${daemonStatePath(root)}`)
    try {
      rmSync(daemonStatePath(root), { force: true })
    } catch (err) {
      reportError(err, 'daemon: clearing stale state file')
    }
  }

  // 1. Metro reporter — write it, optionally wire it into metro.config.js.
  writeMetroReporter(root)
  if (options.wireMetro) {
    const wired = wireMetroReporter(root)
    if (wired.wired) {
      log.success(`Metro reporter wired into ${wired.file}`)
    } else if (wired.reason === 'already-wired') {
      log.dim('Metro reporter already wired')
    } else {
      log.dim(
        `Reporter not auto-wired (${wired.reason || 'no metro.config.js'}) — add: reporter: require('${metroReporterPath(root).replace(root, '.')}')`
      )
    }
  }

  // 2. Knowledge base + Metro event handler.
  const store = new ArtifactStore(root)
  const handler = new MetroEventHandler(store, {
    info: m => log.info(m),
    warn: m => log.warn(m),
    debug: m => log.debug(m),
  })
  let lastProbe: ProbeResult | null = null
  let previousHealth: ProbeResult['health'] | null = null

  // 3. HTTP endpoint (the reporter POSTs here).
  const server = new DaemonServer({
    handleMetroEvent: event => handler.handle(event),
    getStatus: () => ({
      pid: process.pid,
      events: handler.getEventCount(),
      lastProbe,
      reporter: hasMetroReporter(root) ? metroReporterPath(root).replace(root, '.') : null,
    }),
    healthChecks: () => daemonHealthChecks(root),
    log,
  })
  const port = await server.start(options.port ?? 0)

  // 4. Hermes JS-thread probe loop.
  let interval: NodeJS.Timeout | null = null
  if (options.deviceProbe !== false) {
    const metroPort = options.metroPort ?? 8081
    // Guard against overlapping cycles when Metro is slow to answer: a probe
    // that takes longer than the interval simply skips the next tick.
    let inFlight = false
    const cycle = (): void => {
      if (inFlight) return
      inFlight = true
      void runProbeCycle({
        root,
        metroPort,
        store,
        wsFactory: options.wsFactory || defaultWsFactory,
        fetchFn: options.fetchFn,
        previousHealth,
        log,
      })
        .then(result => {
          lastProbe = result
          previousHealth = result.health
        })
        .catch(err => reportError(err, 'daemon: probe cycle'))
        .finally(() => {
          inFlight = false
        })
    }
    void cycle()
    interval = setInterval(cycle, PROBE_INTERVAL_MS)
    // Never keep the process alive on its own (the HTTP server already does).
    if (process.env.NODE_ENV !== 'test') interval.unref()
  }

  // 4b. Telemetry watch loop (opt-in): ingest new crash/analytics exports as
  //     they land in .vectalon/telemetry, so crashes surface in the daemon log
  //     the moment an export appears. The watcher re-resolves the directory
  //     each pass, so a telemetry dir created after startup is picked up.
  let telemetryWatcher: TelemetryWatcher | null = null
  if (options.telemetryWatch) {
    telemetryWatcher = createTelemetryWatcher({
      root,
      intervalMs: options.telemetryWatchIntervalMs ?? 30_000,
      unref: true, // the HTTP server keeps the daemon process alive
      log,
      onDelta: delta => {
        for (const line of renderDeltaSummary(delta)) {
          log.info(line)
        }
      },
    })
    telemetryWatcher.start()
    log.info('Watching telemetry: .vectalon/telemetry — new crash/analytics exports ingest automatically')
  }

  // 5. State file (--stop/--status and the reporter read this).
  writeDaemonState(root, { port, pid: process.pid, startedAt: Date.now() })

  // 6. Shutdown: close the server, clear the loops, remove the state file, and
  //    detach the process listeners so tests can start/stop repeatedly.
  let closed = false
  const close = (): void => {
    if (closed) return
    closed = true
    if (interval) clearInterval(interval)
    if (telemetryWatcher) {
      telemetryWatcher.stop()
      telemetryWatcher = null
    }
    server.close()
    try {
      rmSync(daemonStatePath(root), { force: true })
    } catch (err) {
      reportError(err, 'daemon: removing state file')
    }
    process.removeListener('exit', onExit)
    process.removeListener('SIGINT', onSigint)
    process.removeListener('SIGTERM', onSigterm)
    process.removeListener('uncaughtException', onUncaught)
  }
  const onExit = (): void => close()
  const onSigint = (): void => {
    close()
    process.exit(130)
  }
  const onSigterm = (): void => {
    close()
    process.exit(143)
  }
  // P2-16: a crash must not leave the port bound or the state file behind —
  // close everything and exit non-zero (the global CLI handler also logs +
  // captures telemetry).
  const onUncaught = (err: Error): void => {
    reportError(err, 'daemon: uncaught exception')
    close()
    process.exit(1)
  }
  process.once('exit', onExit)
  process.once('SIGINT', onSigint)
  process.once('SIGTERM', onSigterm)
  process.once('uncaughtException', onUncaught)

  return { port, close }
}

/** Stop a running daemon via its pid file. */
export function stopDaemon(root: string): { stopped: boolean; pid?: number } {
  const state = readDaemonState(root)
  if (!state) return { stopped: false }
  try {
    process.kill(state.pid, 'SIGTERM')
  } catch (err) {
    reportError(err, 'daemon: process already exited')
  }
  try {
    rmSync(daemonStatePath(root), { force: true })
  } catch (err) {
    reportError(err, 'daemon: removing state file')
  }
  return { stopped: true, pid: state.pid }
}

/** Whether a daemon appears to be running (state file + live pid). */
export function isDaemonRunning(root: string): boolean {
  const state = readDaemonState(root)
  return !!state && pidAlive(state.pid)
}

/** Deep checks for the daemon's GET /health: state file + writable store. */
function daemonHealthChecks(root: string): Array<import('../diagnostics/types').HealthCheck> {
  const checks: Array<import('../diagnostics/types').HealthCheck> = []
  const state = readDaemonState(root)
  checks.push(
    state && pidAlive(state.pid)
      ? { name: 'daemon-state', status: 'ok', detail: `daemon pid ${state.pid} alive on port ${state.port}` }
      : { name: 'daemon-state', status: 'fail', detail: 'state file missing or pid not alive' }
  )
  const probePath = join(root, '.vectalon', '.health-probe')
  try {
    mkdirSync(join(root, '.vectalon'), { recursive: true })
    writeFileSync(probePath, 'ok')
    rmSync(probePath, { force: true })
    checks.push({ name: 'artifact-store', status: 'ok', detail: 'knowledge base writable' })
  } catch {
    checks.push({ name: 'artifact-store', status: 'fail', detail: '.vectalon/ is not writable' })
  }
  return checks
}

/** Daemon status for `vectalon daemon --status`. */
export async function daemonStatus(root: string): Promise<DaemonStatus> {
  const state = readDaemonState(root)
  if (!state) return { running: false }
  if (!pidAlive(state.pid)) {
    return { running: false, port: state.port, pid: state.pid, startedAt: state.startedAt, health: 'stale' }
  }
  let health = 'unknown'
  let checks: DaemonStatus['checks']
  try {
    const res = await fetch(`http://127.0.0.1:${state.port}/health`)
    const body = (await res.json()) as { status?: string; checks?: DaemonStatus['checks'] }
    health = body.status || 'unknown'
    checks = body.checks
  } catch (err) {
    health = 'unreachable'
  }
  return { running: true, port: state.port, pid: state.pid, startedAt: state.startedAt, health, checks }
}
