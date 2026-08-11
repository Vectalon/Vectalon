import {
  computeTreemap,
  colorFor,
  renderAsciiBarChart,
  buildBundleReportData,
  renderBundleHtmlReport,
} from '../../src/utils/bundleVisualizer'
import type { BundleAnalysis } from '../../src/utils/bundleAnalyzer'

const ANALYSIS: BundleAnalysis = {
  totalSize: 1_000_000,
  moduleCount: 3,
  packages: [
    { name: 'moment', size: 400_000, moduleCount: 1 },
    { name: 'react-native', size: 350_000, moduleCount: 1 },
    { name: 'lodash', size: 250_000, moduleCount: 1 },
  ],
  largestModules: [
    { name: 'node_modules/moment/moment.js', size: 400_000, sourcePath: '/app/node_modules/moment/moment.js' },
    { name: 'node_modules/lodash/lodash.js', size: 250_000, sourcePath: '/app/node_modules/lodash/lodash.js' },
  ],
  assets: [{ name: 'assets/hero.png', size: 300_000 }],
}

const FINDINGS = [
  { rule: 'large-library', severity: 'warning' as const, message: 'Library "moment" adds 391 KB to the bundle (1 module(s))' },
]

describe('computeTreemap', () => {
  it('returns one rect per item, tiling the area with no overlap', () => {
    const items = [
      { name: 'a', value: 50 },
      { name: 'b', value: 30 },
      { name: 'c', value: 20 },
    ]
    const rects = computeTreemap(items, 100, 50)
    expect(rects).toHaveLength(3)
    const totalArea = rects.reduce((s, r) => s + r.width * r.height, 0)
    // Area is proportional to value (within float rounding).
    expect(totalArea).toBeCloseTo(5000, 0)
    for (const r of rects) {
      expect(r.x).toBeGreaterThanOrEqual(0)
      expect(r.y).toBeGreaterThanOrEqual(0)
      expect(r.x + r.width).toBeLessThanOrEqual(100.001)
      expect(r.y + r.height).toBeLessThanOrEqual(50.001)
    }
    // No two rects overlap (any corner inside another rect).
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i]
        const b = rects[j]
        const overlaps = a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
        expect(overlaps).toBe(false)
      }
    }
  })

  it('area share matches value share', () => {
    const rects = computeTreemap(
      [
        { name: 'big', value: 70 },
        { name: 'small', value: 30 },
      ],
      100,
      100
    )
    const big = rects.find(r => r.name === 'big')!
    expect(big.width * big.height).toBeCloseTo(7000, 0)
  })

  it('skips non-positive values and empty input', () => {
    expect(computeTreemap([{ name: 'x', value: 0 }], 100, 100)).toHaveLength(0)
    expect(computeTreemap([], 100, 100)).toHaveLength(0)
    expect(computeTreemap([{ name: 'x', value: 10 }], 0, 0)).toHaveLength(0)
  })
})

describe('colorFor', () => {
  it('is deterministic and distinct for common names', () => {
    expect(colorFor('moment')).toBe(colorFor('moment'))
    expect(colorFor('moment')).not.toBe(colorFor('lodash'))
  })
})

describe('renderAsciiBarChart', () => {
  it('renders top packages sorted desc with bars and sizes', () => {
    const out = renderAsciiBarChart(ANALYSIS)
    expect(out).toContain('Top packages:')
    expect(out).toContain('moment')
    expect(out).toContain('391 KB')
    expect(out).toContain('█')
    // Sorted desc — moment first.
    expect(out.indexOf('moment')).toBeLessThan(out.indexOf('lodash'))
  })

  it('marks known swap candidates inline', () => {
    const out = renderAsciiBarChart(ANALYSIS)
    expect(out).toContain('swap → dayjs')
  })

  it('respects the top count', () => {
    const out = renderAsciiBarChart(ANALYSIS, { top: 2 })
    expect(out).toContain('moment')
    expect(out).toContain('react-native')
    expect(out).not.toContain('lodash')
  })

  it('returns empty for an empty analysis', () => {
    expect(renderAsciiBarChart({ ...ANALYSIS, totalSize: 0, packages: [] })).toBe('')
  })
})

describe('buildBundleReportData + renderBundleHtmlReport', () => {
  const data = buildBundleReportData(ANALYSIS, {
    platform: 'ios',
    deltaPct: 4.2,
    deltaLabel: '+4.2% (960 KB → 1.0 MB)',
    findings: FINDINGS,
    signals: {},
    toolVersion: '0.1.28',
  })

  it('embeds package data and treemap cells', () => {
    expect(data.treemap).toHaveLength(3)
    expect(data.treemap.map(c => c.name).sort()).toEqual(['lodash', 'moment', 'react-native'])
    const moment = data.treemap.find(c => c.name === 'moment')!
    expect(moment.size).toBe(400_000)
    expect(moment.finding).toBe(true)
    expect(moment.swap).toBe(true)
    expect(data.budgetVerdict).toBe('warn')
    // Largest modules resolve to their owning package (plain + scoped).
    expect(data.largestModules[0].package).toBe('moment')
  })

  it('builds suggestion cards only for packages with signals or alternatives', () => {
    expect(data.suggestions.map(s => s.name)).toEqual(['moment', 'lodash'])
    expect(data.suggestions[0].alternative?.to).toBe('dayjs')
    expect(data.offline).toBe(true)
  })

  it('renders a self-contained dashboard with escaped content', () => {
    const html = renderBundleHtmlReport(data)
    expect(html).toContain('<!DOCTYPE html>')
    expect(html).toContain('vectalon bundle — ios')
    expect(html).toContain('moment')
    expect(html).toContain('dayjs')
    expect(html).toContain('→ swap for <b>dayjs</b>')
    expect(html).toContain('+4.2% (960 KB')
    expect(html).toContain('large-library')
    // Data is embedded as JSON for the page script.
    expect(html).toContain('const DATA =')
  })

  it('escapes package names that could break the HTML', () => {
    const evil = {
      ...ANALYSIS,
      packages: [{ name: '<script>alert(1)</script>', size: 500_000, moduleCount: 1 }],
      totalSize: 500_000,
    }
    const html = renderBundleHtmlReport(
      buildBundleReportData(evil, {
        platform: 'ios',
        deltaPct: null,
        deltaLabel: 'First snapshot — no baseline yet',
        findings: [],
        signals: {},
        toolVersion: '0.1.28',
      })
    )
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;')
    // The embedded JSON escapes every < so a </script> can never close the page script.
    expect(html).toContain('\\u003cscript>alert(1)\\u003c/script>')
  })
})
