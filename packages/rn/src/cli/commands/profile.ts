/**
 * vectalon profile — Hermes runtime profiling & regression detection
 * Business Source License 1.1 (BSL-1.1)
 *
 * Parses Hermes .cpuprofile + heap snapshots, surfaces JS-thread blocking /
 * retained-object / leak findings, stores baselines in the knowledge base, and
 * flags regressions vs the stored baseline. Deterministic — no model calls.
 */

import { existsSync, readFileSync } from 'fs'
import { join, resolve } from 'path'
import { requireTier } from '@vectalon-dev/core'
import { logger } from '../logger'
import { analyzeHermesRuntime, renderPerfReport } from '../../perf'
import { recordPerfBaseline, getLatestPerfBaseline, compareToBaseline, renderBaselineComparison } from '../../perf'
import { ArtifactStore } from '../../knowledge/ArtifactStore'

interface ProfileOptions {
  /** Path to a Hermes .cpuprofile JSON file. */
  profile?: string
  /** Path to a Hermes .heapsnapshot JSON file. */
  heap?: string
  /** Label for the baseline in the knowledge base (default `default`). */
  baseline?: string
  /** Persist this run as the new baseline. */
  saveBaseline?: boolean
  /** Print JSON instead of markdown. */
  json?: boolean
  /** Blocking-run threshold in ms (default 100). */
  thresholdMs?: number
}

/** Best-effort JSON parse; throws a friendly error on failure. */
function readJsonFile(filePath: string, label: string): unknown {
  let raw: string
  try {
    raw = readFileSync(filePath, 'utf-8')
  } catch (err) {
    throw new Error(`Could not read ${label} file ${filePath}: ${err instanceof Error ? err.message : String(err)}`)
  }
  try {
    return JSON.parse(raw)
  } catch (err) {
    throw new Error(`Invalid JSON in ${label} file ${filePath}: ${err instanceof Error ? err.message : String(err)}`)
  }
}

export async function profileCommand(directory: string, options: ProfileOptions): Promise<void> {
  const check = requireTier('pro', 'rn')

  if (!check.allowed) {
    logger.info('⚡ Hermes runtime profiling requires Pro tier.')
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
  const vectalonDir = join(root, '.vectalon')
  if (!existsSync(vectalonDir)) {
    logger.error('No .vectalon/ directory found. Run `vectalon init` first.')
    process.exit(1)
  }

  if (!options.profile && !options.heap) {
    logger.error('Provide at least one input: --profile <file.cpuprofile> and/or --heap <file.heapsnapshot>.')
    process.exit(1)
  }

  const cpuProfile = options.profile ? readJsonFile(resolve(options.profile), 'cpuprofile') : undefined
  const heapSnapshot = options.heap ? readJsonFile(resolve(options.heap), 'heap snapshot') : undefined

  const analysis = analyzeHermesRuntime({ cpuProfile, heapSnapshot }, { blockingThresholdMs: options.thresholdMs })

  const label = options.baseline || 'default'
  const store = new ArtifactStore(root)
  try {
    let compare = null
    if (!options.saveBaseline) {
      const baseline = getLatestPerfBaseline(store, label)
      if (baseline) {
        compare = compareToBaseline(analysis, baseline, {})
      }
    }

    if (options.json) {
      const payload: Record<string, unknown> = {
        analysis,
        baseline: compare ? { regressions: compare.regressions, deltas: compare.deltas, label } : null,
      }
      process.stdout.write(JSON.stringify(payload, null, 2) + '\n')
    } else {
      process.stdout.write(renderPerfReport(analysis))
      if (compare) {
        process.stdout.write('\n' + renderBaselineComparison(compare, label) + '\n')
      }
      if (compare && compare.regressions.length > 0) {
        logger.warn(`${compare.regressions.length} performance regression(s) vs baseline "${label}".`)
      }
    }

    if (options.saveBaseline) {
      const previous = recordPerfBaseline(store, analysis, label)
      if (previous) {
        const blockingPct = compareToBaseline(analysis, previous, {}).deltas.blockingPct
        const blockingText = blockingPct !== null ? ` (${blockingPct >= 0 ? '+' : ''}${blockingPct.toFixed(0)}% blocking)` : ''
        logger.success(`Baseline "${label}" saved${blockingText}.`)
      } else {
        logger.success(`First baseline "${label}" saved.`)
      }
    }
  } finally {
    // Always release the store handle — SQLite stays open otherwise.
    store.close()
  }
}
