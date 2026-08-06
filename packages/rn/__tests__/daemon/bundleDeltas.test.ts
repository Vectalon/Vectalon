import { diffBundleComposition, proactiveBundleTip } from '../../src/daemon/bundleDeltas'
import type { BundleAnalysis } from '../../src/utils/bundleAnalyzer'

function analysis(packages: Array<[string, number]>): BundleAnalysis {
  return {
    totalSize: packages.reduce((sum, [, size]) => sum + size, 0),
    moduleCount: packages.length,
    packages: packages.map(([name, size]) => ({ name, size, moduleCount: 1 })),
    largestModules: [],
    assets: [],
  }
}

describe('diffBundleComposition', () => {
  it('flags added, removed, grew, and shrank packages', () => {
    const previous = analysis([
      ['react-native', 500],
      ['lodash', 100],
      ['zlib', 50],
    ])
    const current = analysis([
      ['react-native', 500],
      ['lodash', 150],
      ['debounce-pkg', 80],
    ])

    const delta = diffBundleComposition(previous, current)

    expect(delta.added).toEqual([{ name: 'debounce-pkg', size: 80, moduleCount: 1 }])
    expect(delta.removed).toEqual([{ name: 'zlib', size: 50, moduleCount: 1 }])
    expect(delta.grew).toEqual([{ name: 'lodash', size: 50, moduleCount: 1 }])
    expect(delta.shrank).toEqual([])
  })

  it('returns an empty delta for identical builds', () => {
    const a = analysis([['react-native', 500]])
    expect(diffBundleComposition(a, a)).toEqual({ added: [], removed: [], grew: [], shrank: [] })
  })

  it('treats a null previous (first build) as everything added', () => {
    const current = analysis([['react-native', 500]])
    const delta = diffBundleComposition(null, current)
    expect(delta.added).toEqual([{ name: 'react-native', size: 500, moduleCount: 1 }])
    expect(delta.removed).toEqual([])
  })
})

describe('proactiveBundleTip', () => {
  it('returns null when there is no delta', () => {
    expect(proactiveBundleTip(null)).toBeNull()
  })

  it('ignores sub-threshold additions (dev noise)', () => {
    const delta = diffBundleComposition(analysis([['a', 10]]), analysis([['a', 10], ['tiny', 4 * 1024]]))
    expect(proactiveBundleTip(delta)).toBeNull()
  })

  it('builds a tip for a meaningful new package', () => {
    const delta = diffBundleComposition(analysis([['a', 10]]), analysis([['a', 10], ['lodash', 80 * 1024]]))
    const tip = proactiveBundleTip(delta)
    expect(tip).not.toBeNull()
    expect(tip).toContain('lodash')
    expect(tip).toContain('80.0 KB')
  })

  it('aggregates several new packages into one tip', () => {
    const delta = diffBundleComposition(
      analysis([['a', 10]]),
      analysis([
        ['a', 10],
        ['lodash', 50 * 1024],
        ['moment', 30 * 1024],
      ])
    )
    const tip = proactiveBundleTip(delta)
    expect(tip).toContain('2 new packages')
    expect(tip).toContain('80.0 KB total')
  })
})
