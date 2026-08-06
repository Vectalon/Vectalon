import { ArtifactStore } from '../../src/knowledge/ArtifactStore'
import {
  recordBundleSnapshot,
  getLatestBundleSnapshot,
  bundleDeltaPct,
  bundleDeltaSummary,
} from '../../src/knowledge/bundleHistory'
import type { BundleAnalysis } from '../../src/utils/bundleAnalyzer'
import { createTempProject, cleanup } from '../helpers/tmp'

function makeAnalysis(overrides: Partial<BundleAnalysis> = {}): BundleAnalysis {
  return {
    totalSize: 1_000_000,
    moduleCount: 42,
    packages: [{ name: 'react-native', size: 600_000, moduleCount: 3 }],
    largestModules: [{ name: 'index.js', size: 300_000 }],
    assets: [{ name: 'logo.png', size: 120_000 }],
    ...overrides,
  }
}

describe('bundleHistory', () => {
  let dir: string

  beforeEach(() => {
    dir = createTempProject({ 'package.json': '{}' })
  })

  afterEach(() => {
    cleanup(dir)
  })

  it('returns null as the previous snapshot on first record', () => {
    const store = new ArtifactStore(dir)
    const previous = recordBundleSnapshot(store, makeAnalysis(), 'ios')
    expect(previous).toBeNull()
  })

  it('returns the prior snapshot when recording a second one', () => {
    const store = new ArtifactStore(dir)
    const first = makeAnalysis({ totalSize: 1_000_000 })
    const second = makeAnalysis({ totalSize: 1_120_000 })
    recordBundleSnapshot(store, first, 'ios')
    const previous = recordBundleSnapshot(store, second, 'ios')
    expect(previous).not.toBeNull()
    expect(previous!.totalSize).toBe(1_000_000)
  })

  it('stores snapshots as analytics artifacts in the store', () => {
    const store = new ArtifactStore(dir)
    recordBundleSnapshot(store, makeAnalysis(), 'android')
    const artifacts = store.findByType('analytics')
    expect(artifacts.length).toBe(1)
    expect(artifacts[0].title).toContain('Bundle size snapshot')
    expect(artifacts[0].meta).toMatchObject({ platform: 'android', bundleKind: 'metro' })
  })

  it('isolates snapshots per platform', () => {
    const store = new ArtifactStore(dir)
    recordBundleSnapshot(store, makeAnalysis({ totalSize: 100 }), 'ios')
    recordBundleSnapshot(store, makeAnalysis({ totalSize: 200 }), 'android')
    const latest = getLatestBundleSnapshot(store, 'android')
    expect(latest!.totalSize).toBe(200)
  })

  it('returns the most recent snapshot, not the first', () => {
    const store = new ArtifactStore(dir)
    recordBundleSnapshot(store, makeAnalysis({ totalSize: 100 }), 'ios')
    recordBundleSnapshot(store, makeAnalysis({ totalSize: 200 }), 'ios')
    recordBundleSnapshot(store, makeAnalysis({ totalSize: 300 }), 'ios')
    const latest = getLatestBundleSnapshot(store, 'ios')
    expect(latest!.totalSize).toBe(300)
  })

  it('trims per-platform history to the last 10 snapshots', () => {
    const store = new ArtifactStore(dir)
    for (let i = 1; i <= 14; i++) {
      recordBundleSnapshot(store, makeAnalysis({ totalSize: i * 100 }), 'ios')
    }
    const snapshots = store.findByType('analytics').filter(a => a.meta?.platform === 'ios')
    expect(snapshots.length).toBe(10)
    // The oldest five were pruned; the latest (1400) is still retrievable.
    const latest = getLatestBundleSnapshot(store, 'ios')
    expect(latest!.totalSize).toBe(1400)
  })

  it('returns null when no snapshot exists for the platform', () => {
    const store = new ArtifactStore(dir)
    expect(getLatestBundleSnapshot(store, 'ios')).toBeNull()
  })

  it('computes the percentage delta between snapshots', () => {
    expect(bundleDeltaPct({ totalSize: 1_000_000 } as BundleAnalysis, { totalSize: 1_120_000 } as BundleAnalysis)).toBeCloseTo(12)
    expect(bundleDeltaPct({ totalSize: 1_000_000 } as BundleAnalysis, { totalSize: 900_000 } as BundleAnalysis)).toBeCloseTo(-10)
  })

  it('returns 0 delta when there is no baseline', () => {
    expect(bundleDeltaPct({ totalSize: 0 } as BundleAnalysis, { totalSize: 100 } as BundleAnalysis)).toBe(0)
  })

  it('renders a human delta summary', () => {
    const previous = makeAnalysis({ totalSize: 1_000_000 })
    const current = makeAnalysis({ totalSize: 1_120_000 })
    const summary = bundleDeltaSummary(previous, current)
    expect(summary).toContain('increases the bundle by 12.0%')
    expect(summary).toContain('977 KB → 1.1 MB')
  })
})
