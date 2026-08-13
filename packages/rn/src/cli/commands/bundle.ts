/**
 * vectalon bundle — Metro bundle analysis and performance budgets
 * Business Source License 1.1 (BSL-1.1)
 *
 * Terminal view: budget findings + a tight verdict + ASCII bars for the top
 * packages. Browser view (--open): a self-contained HTML dashboard with a
 * squarified treemap of the whole bundle, per-package drill-down, highlighted
 * budget violations, and replacement-suggestion cards fed by npm maintenance
 * signals (cached on disk for 24h).
 */

import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { join, resolve } from 'path'
import pc from 'picocolors'
import { requireTier } from '@vectalon-dev/core'
import { logger } from '../logger'
import { analyzeBundleStats, checkBundleBudgets, checkStaticBudgets, runMetroBundleCommand, formatBytes, formatPct, type BudgetFinding } from '../../utils/bundleAnalyzer'
import { budgetCheckOpts } from '../../knowledge/orgPolicy'
import { ArtifactStore } from '../../knowledge/ArtifactStore'
import { getLatestBundleSnapshot, recordBundleSnapshot, bundleDeltaPct } from '../../knowledge/bundleHistory'
import { reportError } from '../../utils/safe'
import { renderAsciiBarChart, buildBundleReportData, renderBundleHtmlReport } from '../../utils/bundleVisualizer'
import { collectBundleSignals } from '../../utils/npmSignals'
import { openInBrowser } from '../../utils/openBrowser'
import pkg from '../../../package.json'

interface BundleOptions {
  platform?: string
  /** Skip the real Metro build; static on-disk checks only. */
  static?: boolean
  /** Open the HTML dashboard in the browser after the run. */
  open?: boolean
  /** Skip writing the HTML dashboard (and the npm signal fetches). */
  html?: boolean
  /** Report output directory (default .vectalon/bundle). */
  report?: string
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

  // Effective budget thresholds: org policy (Team brain) layered under local
  // overrides — an org budget change gates every project that pulled it.
  const budgetOpts = budgetCheckOpts(root)

  // Static budgets always run — deterministic, no build required.
  const staticResult = checkStaticBudgets(root, budgetOpts)
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
      findings.push(...checkBundleBudgets(analysis, budgetOpts))
      const store = new ArtifactStore(root)
      const previous = getLatestBundleSnapshot(store, platform)
      recordBundleSnapshot(store, analysis, platform)
      logger.info(`Bundle: ${formatBytes(analysis.totalSize)} across ${analysis.moduleCount} module(s)`)
      let deltaLabel: string
      if (previous) {
        const pct = bundleDeltaPct(previous, analysis)
        deltaLabel = `${formatPct(pct)} (${formatBytes(previous.totalSize)} → ${formatBytes(analysis.totalSize)})`
        logger.info(`Delta vs previous snapshot: ${deltaLabel}`)
      } else {
        deltaLabel = 'First snapshot — no baseline yet'
        logger.info('First snapshot — no baseline yet.')
      }

      // Option C: terminal ASCII bars for the top packages…
      process.stdout.write(renderAsciiBarChart(analysis) + '\n')

      // …and the browser dashboard (--open) with the full treemap.
      if (options.html !== false) {
        const outDir = resolve(root, options.report || '.vectalon/bundle')
        mkdirSync(outDir, { recursive: true })
        // Best-effort npm maintenance signals for the heaviest packages —
        // cached on disk, so repeat runs make no network calls.
        const signalNames = analysis.packages
          .filter(p => p.name !== 'react-native' && p.name !== 'react')
          .slice(0, 10)
          .map(p => p.name)
        const signals = await collectBundleSignals(root, signalNames)
        const reportData = buildBundleReportData(analysis, {
          platform,
          deltaPct: previous ? bundleDeltaPct(previous, analysis) : null,
          deltaLabel,
          findings,
          signals,
          toolVersion: pkg.version,
        })
        writeFileSync(join(outDir, 'report.json'), JSON.stringify(reportData, null, 2))
        const htmlPath = join(outDir, 'report.html')
        writeFileSync(htmlPath, renderBundleHtmlReport(reportData))
        logger.success(`Bundle dashboard: ${pc.dim(htmlPath)}`)
        if (options.open) {
          openInBrowser(htmlPath)
          logger.info('Opened the dashboard in your browser.')
        }
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
