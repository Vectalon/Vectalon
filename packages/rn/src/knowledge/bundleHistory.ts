import { ArtifactStore } from './ArtifactStore'
import type { BundleAnalysis } from '../utils/bundleAnalyzer'
import { formatBytes } from '../utils/bundleAnalyzer'

/**
 * Bundle-size history in the knowledge base.
 *
 * Each bundle snapshot is stored as an `analytics` artifact so the team brain
 * (and MCP `get_knowledge_context` / `search_knowledge`) sees it like any other
 * artifact. `recordBundleSnapshot` returns the previous snapshot so callers can
 * warn "this PR increases the bundle by X%".
 */

const TITLE_PREFIX = 'Bundle size snapshot'
const SNAPSHOT_TYPE = 'analytics' as const
/** Keep at most this many snapshots per platform so artifacts.json stays bounded. */
const MAX_SNAPSHOTS_PER_PLATFORM = 10

/** Prune the oldest snapshots for a platform beyond the cap (insertion order). */
function trimHistory(store: ArtifactStore, platform: string): void {
  const snapshots = store
    .list()
    .filter(a => a.type === SNAPSHOT_TYPE && a.meta?.platform === platform && a.title.startsWith(TITLE_PREFIX))
  const excess = snapshots.length - MAX_SNAPSHOTS_PER_PLATFORM
  if (excess <= 0) return
  for (const artifact of snapshots.slice(0, excess)) {
    store.remove(artifact.id)
  }
}

/** Persist a bundle analysis snapshot; returns the prior snapshot (or null). */
export function recordBundleSnapshot(
  store: ArtifactStore,
  analysis: BundleAnalysis,
  platform: string
): BundleAnalysis | null {
  const previous = getLatestBundleSnapshot(store, platform)

  const content = [
    `# Bundle size snapshot (${platform})`,
    '',
    `Total: ${formatBytes(analysis.totalSize)} across ${analysis.moduleCount} module(s)`,
    '',
    '## Largest packages',
    ...analysis.packages.slice(0, 15).map(p => `- ${p.name}: ${formatBytes(p.size)} (${p.moduleCount} module(s))`),
    '',
    '## Assets',
    analysis.assets.length > 0
      ? analysis.assets.map(a => `- ${a.name}: ${formatBytes(a.size)}`).join('\n')
      : '- None captured',
  ].join('\n')

  store.add({
    type: SNAPSHOT_TYPE,
    title: `${TITLE_PREFIX}: ${platform}`,
    content,
    source: 'generated',
    status: 'active',
    meta: {
      platform,
      totalSize: String(analysis.totalSize),
      moduleCount: String(analysis.moduleCount),
      bundleKind: 'metro',
    },
  })
  trimHistory(store, platform)

  return previous
}

/** The most recent snapshot artifact's analysis (parsed from its meta), or null. */
export function getLatestBundleSnapshot(store: ArtifactStore, platform: string): BundleAnalysis | null {
  // Artifacts are stored in insertion order, so the last matching entry is the
  // most recent — createdAt alone ties within the same millisecond.
  const candidates = store
    .list()
    .filter(a => a.type === SNAPSHOT_TYPE && a.meta?.platform === platform && a.title.startsWith(TITLE_PREFIX))
  const latest = candidates[candidates.length - 1]
  if (!latest) return null
  const totalSize = Number(latest.meta?.totalSize)
  const moduleCount = Number(latest.meta?.moduleCount)
  if (!Number.isFinite(totalSize)) return null
  return {
    totalSize,
    moduleCount: Number.isFinite(moduleCount) ? moduleCount : 0,
    packages: [],
    largestModules: [],
    assets: [],
  }
}

/** Percentage delta between two snapshots (positive = grew). */
export function bundleDeltaPct(previous: BundleAnalysis, current: BundleAnalysis): number {
  if (!previous || previous.totalSize <= 0) return 0
  return ((current.totalSize - previous.totalSize) / previous.totalSize) * 100
}

/** A one-line human summary, e.g. "+12.0% (1.2 MB → 1.3 MB)". */
export function bundleDeltaSummary(previous: BundleAnalysis, current: BundleAnalysis): string {
  const pct = bundleDeltaPct(previous, current)
  const verb = pct > 0 ? 'increases' : pct < 0 ? 'decreases' : 'keeps'
  const magnitude = `${Math.abs(pct).toFixed(1)}%`
  return `${verb} the bundle by ${magnitude} (${formatBytes(previous.totalSize)} → ${formatBytes(current.totalSize)})`
}
