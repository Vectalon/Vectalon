/**
 * `vectalon status` (P2-15) — the first thing you ask a customer to run.
 *
 * One read-only command that prints: daemon running? (pid, port, health),
 * MCP server reachable? (tool count), model provider status (ready/degraded),
 * last background refresh time, license/trial days remaining, and .vectalon/
 * disk usage. Every probe is wrapped so a single broken source (e.g. a stale
 * state file, a missing license) degrades to a line instead of killing the
 * whole report.
 */
import { existsSync, readdirSync, statSync } from 'fs'
import { join, resolve } from 'path'
import pc from 'picocolors'
import { logger } from '../logger'
import { daemonStatus } from '../../daemon'
import { KnowledgeRefreshService } from '../../knowledge/refresh'
import { ArtifactStore } from '../../knowledge/ArtifactStore'
import { ContextEngine } from '../../harness/ContextEngine'
import { ModelRouter } from '../../model/ModelRouter'
import { MCPServer } from '../../protocol/MCPServer'
import { LicenseStore, LicenseValidator } from '@vectalon-dev/core'
import { trialDaysRemaining, trialStatus } from '../../auth/trialState'
import { resolveProjectModelProvider, resolveProjectModelConfig } from '../../projectManifest'
import { activeModelLabel, isRemoteKeyMissing, detectModelAvailability } from '../../model/setup'
import { checkHeartbeatStaleness } from '../../diagnostics/alerts'

export async function statusCommand(): Promise<void> {
  const root = resolve(process.cwd())
  const vectalonDir = join(root, '.vectalon')
  const initialized = existsSync(vectalonDir)

  // P2-19: the status run is also a natural place to surface a heartbeat that
  // went silent (>30 min, active license) — a customer running `status` sees
  // the alert path fire before support even looks at the logs.
  checkHeartbeatStaleness(root)

  if (!initialized) {
    logger.error('No .vectalon/ directory found. Run `vectalon init` first.')
    process.exit(1)
  }

  logger.info(pc.bold(pc.cyan('vectalon status')))

  await printDaemon(root)
  await printMcp(root)
  printModel(root)
  printRefresh(root)
  printLicense()
  printDiskUsage(vectalonDir)

  logger.info('')
  logger.dim('Need help? Run `vectalon doctor --json` for a full toolchain report, or `vectalon support --upload` to send a support bundle.')
}

async function printDaemon(root: string): Promise<void> {
  const status = await daemonStatus(root)
  if (!status.running) {
    const stale = status.health === 'stale' ? ' — stale pid file (the daemon crashed; restart with `vectalon daemon`)' : ''
    logger.info(`Daemon: ${pc.yellow('not running')}${stale}`)
    return
  }
  logger.info(
    `Daemon: ${pc.green('running')} (pid ${status.pid}, port ${status.port}, started ${new Date(status.startedAt || 0).toISOString()}, health ${status.health})`
  )
  for (const check of status.checks || []) {
    const icon = check.status === 'ok' ? pc.green('✔') : check.status === 'warn' ? pc.yellow('⚠') : pc.red('✖')
    logger.dim(`  ${icon} ${check.name}: ${check.detail}`)
  }
}

async function printMcp(root: string): Promise<void> {
  // Tool count is deterministic (the in-process registry) so `status` is
  // useful even with no server running. When the daemon is up we also probe
  // its /tools endpoint for a true reachability check.
  let toolCount = 0
  try {
    const engine = new ContextEngine(root)
    const router = new ModelRouter({ projectRoot: root })
    const store = new ArtifactStore(root, { engine: 'json' })
    const server = new MCPServer(engine, router, 'mcp', store, null, [], { root })
    toolCount = server.getToolList().length
  } catch (err) {
    logger.dim(`  MCP server: tool count unavailable (${err instanceof Error ? err.message : String(err)})`)
    return
  }

  const status = await daemonStatus(root)
  if (status.running) {
    try {
      // P2-15: a stale port that accepts but never responds must not hang the
      // first command support asks customers to run — 5s cap.
      const res = await fetch(`http://127.0.0.1:${status.port}/tools`, {
        signal: AbortSignal.timeout(5000),
      })
      const body = (await res.json()) as { tools?: unknown[]; status?: string }
      const liveCount = Array.isArray(body.tools) ? body.tools.length : null
      logger.info(
        `MCP server: ${pc.green('reachable')} on port ${status.port} (${liveCount !== null ? `${liveCount} tools live` : `server ${body.status || 'unknown'}`}; ${toolCount} registered)`
      )
    } catch {
      logger.info(`MCP server: ${pc.yellow('port not responding')} (${toolCount} tools registered; start with \`vectalon serve\`)`)
    }
    return
  }
  logger.info(`MCP server: ${pc.yellow('not running')} (${toolCount} tools registered; start with \`vectalon serve\`)`)
}

function printModel(root: string): void {
  let provider = 'local'
  try {
    provider = resolveProjectModelProvider(root) as string
  } catch {
    // fall through to the label below
  }
  const config = resolveProjectModelConfig(root)
  const label = activeModelLabel(provider, config)

  let status: 'ready' | 'degraded' = 'ready'
  let detail = ''
  try {
    const availability = detectModelAvailability()
    if (provider === 'local') {
      status = availability.localDownloaded ? 'ready' : 'degraded'
      detail = availability.localDownloaded ? '' : ' no model downloaded — run `vectalon pull`'
    } else if (provider === 'wasm') {
      status = availability.wasmReady ? 'ready' : 'degraded'
      detail = availability.wasmReady ? ' (downloads on first tool use)' : ' WASM unavailable (RN_VECTALON_NO_WASM set?)'
    } else if (isRemoteKeyMissing(provider, config)) {
      status = 'degraded'
      const keyEnv = config?.apiKeyEnv || `${provider.toUpperCase()}_API_KEY`
      detail = ` missing API key — set ${keyEnv}`
    }
  } catch (err) {
    detail = ` (status check failed: ${err instanceof Error ? err.message : String(err)})`
  }

  const icon = status === 'ready' ? pc.green('ready') : pc.yellow('degraded')
  logger.info(`Model: ${provider} (${label}) — ${icon}${detail}`)
}

function printRefresh(root: string): void {
  try {
    const refresh = new KnowledgeRefreshService({ projectRoot: root })
    const last = refresh.getLastRefreshAt()
    logger.info(last > 0 ? `Last background refresh: ${new Date(last).toISOString()}` : pc.dim('Last background refresh: never'))
    const suggestions = refresh.getSuggestions()
    if (suggestions.length > 0) {
      logger.info(`${suggestions.length} improvement suggestion(s) — run \`vectalon suggestions\` to review`)
    }
  } catch {
    logger.dim('Last background refresh: unknown')
  }
}

function printLicense(): void {
  try {
    const license = LicenseStore.read()
    if (license?.key) {
      const validation = LicenseValidator.validate(license.key)
      if (validation.valid && validation.license) {
        const days = LicenseValidator.daysRemaining(validation.license)
        const exp = new Date(validation.license.expiresAt).toISOString().split('T')[0]
        logger.info(`License: ${pc.green('active')} (${days} days remaining, expires ${exp})`)
        return
      }
      logger.info(`License: ${pc.yellow('invalid')} — run \`vectalon auth --license <key>\` with a valid key`)
      return
    }
    const trial = trialStatus()
    if (trial.status === 'active') {
      const days = trialDaysRemaining(trial)
      logger.info(`License: ${pc.green('trial')} (${days} days remaining)`)
      return
    }
    logger.info('License: free tier (no license or trial active — `vectalon auth` to start a trial)')
  } catch (err) {
    logger.dim(`License: unknown (${err instanceof Error ? err.message : String(err)})`)
  }
}

function printDiskUsage(dir: string): void {
  try {
    const bytes = dirSize(dir)
    logger.info(`.vectalon/ disk usage: ${formatBytes(bytes)}`)
  } catch (err) {
    logger.dim(`.vectalon/ disk usage: unavailable (${err instanceof Error ? err.message : String(err)})`)
  }
}

/** Recursive byte size of a directory. */
function dirSize(dir: string): number {
  let total = 0
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    let stat: ReturnType<typeof statSync>
    try {
      stat = statSync(full)
    } catch {
      continue // broken symlink / raced file — skip
    }
    if (stat.isDirectory()) total += dirSize(full)
    else total += stat.size
  }
  return total
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${bytes} B`
}
