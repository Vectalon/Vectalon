/**
 * vectalon bundle — Metro bundle analysis and performance budgets
 * Business Source License 1.1 (BSL-1.1)
 */

import { existsSync } from 'fs'
import { join, resolve } from 'path'
import { requireTier } from '@vectalon-dev/core'
import { logger } from '../logger'
import { analyzeBundleStats, checkBundleBudgets, checkStaticBudgets, runMetroBundleCommand, formatBytes, formatPct, type BudgetFinding } from '../../utils/bundleAnalyzer'
import { ArtifactStore } from '../../knowledge/ArtifactStore'
import { getLatestBundleSnapshot, recordBundleSnapshot, bundleDeltaPct } from '../../knowledge/bundleHistory'
import { reportError } from '../../utils/safe'

interface BundleOptions {
  platform?: string
  /** Skip the real Metro build; static on-disk checks only. */
  static?: boolean
}

export async function bundleCommand(directory: string, options: BundleOptions): Promise<void> {
  const check = requireTier('pro', 'rn', 'bundle')

  if (!check.allowed) {
    logger.info('⚡ Bundle budget analysis requires Pro tier.')
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

  const platform = options.platform === 'android' ? 'android' : 'ios'

  // Static budgets always run — deterministic, no build required.
  const staticResult = checkStaticBudgets(root)
  const findings: BudgetFinding[] = [...staticResult.findings]
  logger.info(`Static checks: ${staticResult.checkedPackages} dependency(ies) inspected for sideEffects: false`)
  for (const f of staticResult.findings) {
    const icon = f.severity === 'warning' ? '⚠️' : 'ℹ️'
    logger.info(`  ${icon} ${f.message}`)
  }

  let analysis
  if (options.static) {
    logger.info('Skipping the Metro build (--static). No bundle snapshot taken.')
  } else {
    logger.info(`Building the ${platform} bundle with Metro (--json)...`)
    let stats
    try {
      stats = await runMetroBundleCommand(root, platform)
    } catch (err) {
      reportError(err, 'bundle: metro bundle build failed', 'warn')
      stats = null
    }
    if (!stats) {
      logger.warn('Could not build the bundle (no entry file or react-native not installed). Static checks only.')
    } else {
      analysis = analyzeBundleStats(stats)
      findings.push(...checkBundleBudgets(analysis))
      const store = new ArtifactStore(root)
      const previous = getLatestBundleSnapshot(store, platform)
      recordBundleSnapshot(store, analysis, platform)
      logger.info(`Bundle: ${formatBytes(analysis.totalSize)} across ${analysis.moduleCount} module(s)`)
      if (previous) {
        const pct = bundleDeltaPct(previous, analysis)
        logger.info(`Delta vs previous snapshot: ${formatPct(pct)} (${formatBytes(previous.totalSize)} → ${formatBytes(analysis.totalSize)})`)
      } else {
        logger.info('First snapshot — no baseline yet.')
      }
    }
  }

  if (findings.length === 0) {
    logger.success('All performance budgets met.')
    return
  }

  logger.warn(`${findings.length} budget finding(s):`)
  for (const f of findings) {
    const icon = f.severity === 'warning' ? '⚠️' : 'ℹ️'
    logger.warn(`  ${icon} [${f.rule}] ${f.message}`)
  }
}
