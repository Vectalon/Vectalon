/**
 * vectalon visual-baseline — committed baseline management
 * Business Source License 1.1 (BSL-1.1)
 */

import { existsSync, readdirSync } from 'fs'
import { join, resolve, basename, sep } from 'path'
import { requireTier } from '@vectalon-dev/core'
import { logger } from '../logger'
import { ReferenceStore, visualBaselineDir, isValidReferenceKey } from '../../utils/referenceStore'
import type { ReferenceEntry } from '../../utils/referenceStore'
import { kebabCase } from '../../utils/deepLink'
import type { VisualDiffOptions } from '../../utils/visualDiff'
import { detectDevicePlatform } from '../../adapters/deviceControl'

interface VisualBaselineCliOptions {
  list?: boolean
  capture?: string
  update?: string
  from?: string
  platform?: string
  note?: string
  tolerance?: string
  quarantine?: string
  reason?: string
  unquarantine?: string
  prune?: boolean
  dryRun?: boolean
  json?: boolean
}

/** Screen keys present in the project (src/**Screen.tsx or under screens/). */
function screenKeysInProject(root: string): string[] {
  const srcDir = join(root, 'src')
  if (!existsSync(srcDir)) return []
  const keys = new Set<string>()
  const walk = (dir: string): void => {
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(full)
      } else if (entry.isFile()) {
        const base = basename(entry.name).replace(/\.[jt]sx?$/, '')
        const inScreensDir = dir.includes(`${sep}screens${sep}`) || dir.endsWith('/screens')
        if (/Screen$/.test(base) || inScreensDir) {
          const key = kebabCase(base)
          if (key) keys.add(key)
        }
      }
    }
  }
  walk(srcDir)
  return [...keys]
}

function parseTolerance(raw: string | undefined): Partial<VisualDiffOptions> | undefined {
  if (!raw) return undefined
  try {
    const parsed = JSON.parse(raw) as unknown
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error('must be a JSON object')
    }
    return parsed as Partial<VisualDiffOptions>
  } catch (err) {
    throw new Error(`invalid --tolerance JSON: ${err instanceof Error ? err.message : String(err)}`)
  }
}

function formatEntry(e: ReferenceEntry): Record<string, unknown> {
  return {
    key: e.key,
    platform: e.platform,
    source: e.source,
    capturedAt: e.capturedAt,
    quarantined: !!e.quarantine,
    quarantineReason: e.quarantine?.reason,
    tolerance: e.tolerance,
  }
}

export async function visualBaselineCommand(directory: string, options: VisualBaselineCliOptions): Promise<void> {
  const check = requireTier('pro', 'rn')
  if (!check.allowed) {
    logger.info('⚡ Visual baseline management requires Pro tier.')
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

  const root = resolve(directory || process.cwd())
  const store = new ReferenceStore(root, { dir: visualBaselineDir(root) })

  function fail(message: string): never {
    logger.error(message)
    process.exit(1)
  }

  if (options.list) {
    const entries = store.list()
    if (options.json) {
      logger.out(JSON.stringify(entries.map(formatEntry), null, 2) + '\n')
      return
    }
    if (entries.length === 0) {
      logger.info('No committed baselines yet. Capture one with:')
      logger.info('  vectalon visual-baseline --capture <screen-key> --from <screen.png>')
      return
    }
    logger.info('Committed visual baselines (docs/vectalon/visual-baselines):')
    for (const e of entries) {
      const flag = e.quarantine ? ` — QUARANTINED: ${e.quarantine.reason}` : ''
      logger.info(`  ${e.key} (${e.platform}, ${new Date(e.capturedAt).toISOString()})${flag}`)
    }
    return
  }

  if (options.capture || options.update) {
    const key = options.capture || options.update || ''
    if (!isValidReferenceKey(key)) fail(`Invalid baseline key: ${key}`)
    const from = options.from
    if (!from) fail('Pass --from <png> with the screenshot to store')
    const absFrom = resolve(root, from)
    if (!existsSync(absFrom)) fail(`Screenshot not found: ${from}`)

    const existing = store.get(key)
    if (options.capture && existing) {
      fail(`Baseline "${key}" already exists — use --update to replace it`)
    }

    let tolerance: Partial<VisualDiffOptions> | undefined
    try {
      tolerance = parseTolerance(options.tolerance)
    } catch (err) {
      fail(err instanceof Error ? err.message : String(err))
    }

    const platform = options.platform === 'android' || options.platform === 'ios'
      ? options.platform
      : existing?.platform || detectDevicePlatform(root)
    const source = options.capture ? 'visual baseline capture' : 'visual baseline update'
    const entry = store.save(key, absFrom, {
      platform,
      source,
      capturedAt: Date.now(),
      // An update replaces the expectation — any declared flake state is stale.
      quarantine: options.update ? null : undefined,
      tolerance,
    })
    if (!entry) fail(`Could not store baseline for "${key}"`)

    if (options.json) {
      logger.out(JSON.stringify({ action: options.capture ? 'capture' : 'update', baseline: formatEntry(entry) }, null, 2) + '\n')
      return
    }
    logger.success(`Baseline ${options.capture ? 'captured' : 'updated'} for "${key}" (${platform})`)
    logger.dim(`  ${entry.path}`)
    logger.dim('  Commit docs/vectalon/visual-baselines/ with the PR to share it with CI.')
    return
  }

  if (options.quarantine || options.unquarantine) {
    const key = options.quarantine || options.unquarantine || ''
    if (!store.get(key)) fail(`No baseline for "${key}"`)
    const quarantine = options.quarantine
      ? { reason: options.reason || 'quarantined by maintainer', since: Date.now() }
      : null
    if (!store.setQuarantine(key, quarantine)) fail(`Could not update quarantine for "${key}"`)
    if (options.json) {
      logger.out(JSON.stringify({ key, quarantined: !!quarantine, reason: quarantine?.reason }, null, 2) + '\n')
      return
    }
    logger.success(quarantine
      ? `"${key}" quarantined (${quarantine.reason}) — it reports but never gates`
      : `"${key}" unquarantined — it gates again`)
    return
  }

  if (options.prune) {
    const projectKeys = new Set(screenKeysInProject(root))
    const candidates = store.list().filter(e => !projectKeys.has(e.key))
    if (options.dryRun) {
      logger.info(`Prune dry run: ${candidates.length} baseline(s) reference no screen in the project:`)
      for (const e of candidates) logger.dim(`  ${e.key} (${e.platform})`)
      if (candidates.length === 0) logger.info('  (nothing to prune)')
      return
    }
    const removed: string[] = []
    for (const e of candidates) {
      if (store.remove(e.key)) removed.push(e.key)
    }
    if (options.json) {
      logger.out(JSON.stringify({ removed }, null, 2) + '\n')
      return
    }
    if (removed.length > 0) {
      logger.success(`Pruned ${removed.length} stale baseline(s): ${removed.join(', ')}`)
    } else {
      logger.info('Nothing to prune — every baseline matches a screen in the project.')
    }
    return
  }

  fail('Nothing to do — pass --list, --capture, --update, --quarantine, --unquarantine, or --prune')
}
