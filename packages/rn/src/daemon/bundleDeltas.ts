import type { BundleAnalysis, PackageSize } from '../utils/bundleAnalyzer'
import { formatBytes } from '../utils/bundleAnalyzer'
import type { BundleCompositionDelta } from './types'

/**
 * Bundle-composition diffing for the daemon's proactive loop.
 *
 * `recordBundleSnapshot` (bundleHistory) persists only totals in artifact meta,
 * so the daemon keeps the previous analysis in memory and diffs the full
 * package composition — that's what powers "your last Metro build added
 * lodash — that's +80 KB".
 */

/**
 * Diff two bundle analyses by package. `previous` may be null on the first
 * build of a session — callers treat that as "no delta".
 */
export function diffBundleComposition(
  previous: BundleAnalysis | null,
  current: BundleAnalysis
): BundleCompositionDelta {
  const byName = (analysis: BundleAnalysis | null): Map<string, PackageSize> => {
    const map = new Map<string, PackageSize>()
    for (const pkg of analysis?.packages || []) {
      map.set(pkg.name, pkg)
    }
    return map
  }

  const prev = byName(previous)
  const curr = byName(current)

  const added: BundleCompositionDelta['added'] = []
  const removed: BundleCompositionDelta['removed'] = []
  const grew: BundleCompositionDelta['grew'] = []
  const shrank: BundleCompositionDelta['shrank'] = []

  // Names present in the CURRENT build — anything in prev but not here is gone.
  const inCurrent = new Set<string>(curr.keys())
  for (const pkg of current.packages) {
    const before = prev.get(pkg.name)
    if (!before) {
      added.push({ name: pkg.name, size: pkg.size, moduleCount: pkg.moduleCount })
    } else if (pkg.size > before.size) {
      grew.push({ name: pkg.name, size: pkg.size - before.size, moduleCount: pkg.moduleCount })
    } else if (pkg.size < before.size) {
      shrank.push({ name: pkg.name, size: before.size - pkg.size, moduleCount: before.moduleCount })
    }
  }
  for (const name of prev.keys()) {
    if (!inCurrent.has(name)) {
      const pkg = prev.get(name)
      if (pkg) removed.push({ name: pkg.name, size: pkg.size, moduleCount: pkg.moduleCount })
    }
  }

  return { added, removed, grew, shrank }
}

/**
 * Packages too small to be worth a proactive warning (noise guard — a build
 * churn of a few KB is normal dev output).
 */
const MIN_TIP_SIZE_BYTES = 10 * 1024

/**
 * One-line proactive insight for a composition delta, or null when nothing is
 * worth surfacing. Picks the largest new package and suggests slimming it.
 */
export function proactiveBundleTip(delta: BundleCompositionDelta | null): string | null {
  if (!delta) return null
  const additions = delta.added.filter(p => p.size >= MIN_TIP_SIZE_BYTES).sort((a, b) => b.size - a.size)
  if (additions.length === 0) return null

  const biggest = additions[0]
  const total = additions.reduce((sum, p) => sum + p.size, 0)
  const subject =
    additions.length === 1
      ? `${biggest.name} (${formatBytes(biggest.size)})`
      : `${additions.length} new packages (${formatBytes(total)} total, biggest: ${biggest.name})`
  return (
    `Your last Metro build added ${subject} — if you only need a slice of it, import it selectively ` +
    `(e.g. \`import debounce from '${biggest.name}/debounce'\` or \`import { debounce } from '${biggest.name}'\`) to keep the bundle lean.`
  )
}
