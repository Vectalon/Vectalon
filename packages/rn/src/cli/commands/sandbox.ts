/**
 * vectalon sandbox — run code in an isolated process with no ambient authority
 * Business Source License 1.1 (BSL-1.1)
 *
 * Usage:
 *   vectalon sandbox [dir] -- <command> [args...]
 *
 * Runs `<command>` inside the strongest sandbox backend available: scrubbed
 * environment (deny-by-default), writes confined to `dir` (the sandbox root)
 * on macOS/Linux, network denied by default, bounded by a wall-clock timeout
 * and optional CPU/memory limits. Prints a structured report of what ran and
 * what was dropped — the trust foundation for auto-executed code.
 */

import { resolve } from 'path'
import { requireTier } from '@vectalon-dev/core'
import { logger } from '../logger'
import { runSandboxed, renderSandboxResult, detectBackend } from '../../sandbox'

export interface SandboxCommandOptions {
  /** Sandbox root — working directory + the only writable location. */
  root?: string
  /** Wall-clock timeout in ms (default 30000). */
  timeout?: number
  /** CPU time limit in seconds. */
  cpu?: number
  /** Virtual memory limit in MB. */
  memory?: number
  /** Allow outbound network (default: denied where supported). */
  network?: boolean
  /** Comma-separated ambient env vars to keep. */
  allowEnv?: string
  /** JSON output instead of the human report. */
  json?: boolean
}

export async function sandboxCommand(command: string, args: string[], options: SandboxCommandOptions): Promise<void> {
  if (!command || typeof command !== 'string' || !command.trim()) {
    logger.error('Pass the command to run inside the sandbox: vectalon sandbox -- <command> [args...]')
    process.exit(1)
  }

  const check = requireTier('pro', 'rn')

  if (!check.allowed) {
    logger.info('⚡ Sandboxed code execution requires Pro tier.')
    logger.info(`Current: ${check.currentTier} | Required: ${check.requiredTier}`)
    if (check.canTrial) {
      logger.info('')
      logger.info('🔄 Start 14-day Pro trial?')
      logger.info('   Run: npx vectalon auth --github')
      logger.info('   Or visit: https://vectalon.in/trial?product=rn')
    }
    logger.info('')
    logger.info('💳 Upgrade at: https://vectalon.in/pricing')
    process.exit(1)
  }

  const root = resolve(options.root || process.cwd())
  const allowEnv = (options.allowEnv || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)

  const backend = detectBackend()
  logger.info(
    `Sandbox backend: ${backend.isolation}${backend.canConfineWrites ? '' : ' (no OS write/network confinement — process-level only)'}`
  )
  logger.info(`Sandbox root: ${root}`)
  if (!options.network) logger.info('Network: denied by default')

  const result = await runSandboxed(command, args, {
    root,
    timeoutMs: options.timeout,
    cpuSeconds: options.cpu,
    memoryMb: options.memory,
    network: options.network,
    allowEnv,
  })

  // Failure must be observable via the exit code in BOTH output modes — a
  // script consuming `--json` relies on it the same way a human reads the
  // report.
  if (!result.ok) {
    process.exitCode = 1
  }

  if (options.json) {
    logger.out(JSON.stringify(result, null, 2) + '\n')
    return
  }

  logger.out(renderSandboxResult(result) + '\n')
}
