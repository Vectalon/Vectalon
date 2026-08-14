/**
 * vectalon upgrade — orchestrator + barrel
 * Business Source License 1.1 (BSL-1.1)
 *
 * `vectalon upgrade` pipeline: Detect → Catalog → Impact → Plan → Codemods →
 * Verify. Planning is always side-effect free; codemods + verification run
 * only when the caller opts in (--apply) and never in dry-run mode.
 */

import { planUpgrade, refreshNewArchAfter } from './planner'
import { applyUpgradeCodemods, captureBundleSnapshot } from './codemods'
import { verifyUpgrade } from './verify'
import { analyzeBundleStats, runMetroBundleCommand } from '../utils/bundleAnalyzer'
import type { UpgradeReport, UpgradeRunOptions } from './types'

export * from './types'
export { detectVersions, versionParts, isAtLeast, describeDetection } from './detect'
export { MIGRATION_CATALOG, RN_REACT_PAIRS, EXPO_SDK_RN_PAIRS, KNOWN_RN_MINORS, LATEST_KNOWN_RN, resolveTargetRn, requiredIosDeploymentTarget } from './catalog'
export { analyzeUpgradeImpact, summarizeImpact } from './impact'
export { planUpgrade, resolveTarget } from './planner'
export { applyUpgradeCodemods, applyEditsToContent, renderUpgradeMarkdown } from './codemods'
export { verifyUpgrade } from './verify'
export { renderUpgradeReport } from './report'
export {
  rnDiffPurgeUrl,
  upgradeHelperUrl,
  classifyRnDiffPath,
  parseRnDiff,
  parseRnDiffFiles,
  summarizeRnDiff,
  fetchRnDiffPurge,
  renderRnDiffSummary,
  type RnDiffBucket,
  type RnDiffFileChange,
  type RnDiffPurgeSummary,
} from './rnDiffPurge'

/**
 * Run the full upgrade pipeline for a project root.
 *
 * - dry-run (default): detect + catalog + impact + plan, no writes.
 * - --apply: execute auto codemods (+ review with --force), back up every
 *   edited file, write the provenance manifest, then verify (doctor,
 *   typecheck, bundle budget gate) unless verify is disabled.
 */
export async function runUpgrade(root: string, options: UpgradeRunOptions = {}): Promise<UpgradeReport> {
  const progress = options.onProgress || (() => undefined)
  progress('detect', 'Reading project versions…')
  const report = planUpgrade(root, options)

  const applying = options.apply === true && options.dryRun !== true
  if (!applying) {
    return report
  }
  if (report.steps.length === 0) {
    return report
  }

  progress('codemods', 'Applying codemods…')
  const before = await captureBundleBefore(root)
  const applied = applyUpgradeCodemods(root, report, { force: options.force === true })
  const refreshed = refreshNewArchAfter(root, applied)

  if (options.verify !== false) {
    progress('verify', 'Running verification (doctor, typecheck, bundle gate)…')
    const verify = await verifyUpgrade(root, refreshed)
    return { ...refreshed, verify }
  }
  void before
  return refreshed
}

/** Best-effort pre-upgrade bundle snapshot for the regression gate. */
async function captureBundleBefore(root: string): Promise<void> {
  try {
    const metro = await runMetroBundleCommand(root)
    if (metro) {
      const analysis = analyzeBundleStats(metro)
      captureBundleSnapshot(root, { totalSize: analysis.totalSize, moduleCount: analysis.moduleCount })
    }
  } catch (err) {
    // A missing/failed bundle build never blocks the upgrade.
  }
}
