import { existsSync } from 'fs'
import { join, resolve } from 'path'
import { logger } from '../logger'
import { ArtifactStore } from '../../knowledge/ArtifactStore'
import { startDaemon, stopDaemon, daemonStatus, runProbeCycle } from '../../daemon'
import { startHeartbeat } from '../../diagnostics/heartbeat'
import { checkHeartbeatStaleness } from '../../diagnostics/alerts'
import { resolveProjectModelProvider } from '../../projectManifest'

export interface DaemonCommandOptions {
  port?: number
  metroPort?: number
  stop?: boolean
  status?: boolean
  once?: boolean
  deviceProbe?: boolean
  wireMetro?: boolean
  telemetryWatch?: boolean
}

export async function daemonCommand(options: DaemonCommandOptions): Promise<void> {
  const root = resolve(process.cwd())

  if (!existsSync(join(root, '.vectalon'))) {
    logger.error('No .vectalon/ directory found. Run `vectalon init` first.')
    process.exit(1)
  }

  // P2-19: surface a silent heartbeat (>30 min, active license) on the next run.
  checkHeartbeatStaleness(root)

  if (options.stop) {
    const result = stopDaemon(root)
    if (!result.stopped) {
      logger.info('No vectalon daemon is running (no state file).')
    } else {
      logger.success(`Daemon stopped (pid ${result.pid})`)
    }
    return
  }

  if (options.status) {
    const status = await daemonStatus(root)
    if (!status.running) {
      const stale = status.health === 'stale' ? ' (stale pid file — the daemon crashed)' : ''
      logger.info(`Daemon: not running${stale}`)
    } else {
      logger.info(
        `Daemon: running (pid ${status.pid}, port ${status.port}, started ${new Date(status.startedAt || 0).toISOString()}, health ${status.health})`
      )
      for (const check of status.checks || []) {
        const icon = check.status === 'ok' ? '✔' : check.status === 'warn' ? '⚠' : '✖'
        logger.dim(`  ${icon} ${check.name}: ${check.detail}`)
      }
    }
    return
  }

  if (options.once) {
    // One probe pass, then exit — handy for CI or a manual health check.
    const store = new ArtifactStore(root)
    const result = await runProbeCycle({
      root,
      metroPort: options.metroPort ?? 8081,
      store,
      log: logger,
      previousHealth: null,
    })
    logger.info(
      `Probe: detected=${result.detected} health=${result.health}${
        result.latencyMs !== null ? ` latency=${result.latencyMs}ms` : ''
      }`
    )
    return
  }

  try {
    const { port } = await startDaemon(root, {
      port: options.port,
      metroPort: options.metroPort,
      deviceProbe: options.deviceProbe,
      wireMetro: options.wireMetro,
      telemetryWatch: options.telemetryWatch,
      log: logger,
    })
    logger.success(`vectalon daemon running on port ${port}`)
    logger.info('Metro reporter: .vectalon/metro/vectalon-reporter.js')
    logger.info("Wire it into metro.config.js: reporter: require('./.vectalon/metro/vectalon-reporter.js') (or rerun with --wire-metro)")
    const watching = ['Metro build events (bundle size + build errors)', 'Hermes JS-thread health']
    if (options.telemetryWatch) watching.push('telemetry exports (.vectalon/telemetry)')
    logger.info(`Watching: ${watching.join(', ')}`)
    logger.info('Stop with: vectalon daemon --stop')
    // Liveness heartbeat (every 5 min, opt-out). The daemon process lives
    // until --stop/SIGTERM, so the unref'd interval dies with the process.
    startHeartbeat({
      kind: 'daemon',
      root,
      modelProvider: resolveProjectModelProvider(root),
    })
  } catch (err) {
    logger.error(err instanceof Error ? err.message : String(err))
    process.exit(1)
  }
}
