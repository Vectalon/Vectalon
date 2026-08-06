import {
  parseMetroStats,
  analyzeBundleStats,
  packageFromModulePath,
  checkBundleBudgets,
  checkStaticBudgets,
  formatBytes,
  formatPct,
} from '../../src/utils/bundleAnalyzer'
import { join } from 'path'
import { createTempProject, cleanup } from '../helpers/tmp'

const SAMPLE_STATS = {
  modules: [
    { name: 'node_modules/react-native/index.js', size: 50000, sourcePath: '/app/node_modules/react-native/index.js' },
    { name: 'node_modules/reanimated/index.js', size: 150000, sourcePath: '/app/node_modules/reanimated/index.js' },
    { name: 'node_modules/reanimated/useSharedValue.js', size: 20000, sourcePath: '/app/node_modules/reanimated/useSharedValue.js' },
    { name: 'src/screens/Home.tsx', size: 3000, sourcePath: '/app/src/screens/Home.tsx' },
    { name: 'src/index.ts', size: 500, sourcePath: '/app/src/index.ts' },
  ],
  assets: [
    { name: 'assets/splash.png', size: 300000 },
    { name: 'assets/logo.png', size: 50000 },
  ],
}

describe('parseMetroStats', () => {
  it('parses a JSON string of Metro bundle output', () => {
    const stats = parseMetroStats(JSON.stringify(SAMPLE_STATS))
    expect(stats).not.toBeNull()
    expect(stats?.modules).toHaveLength(5)
    expect(stats?.assets).toHaveLength(2)
  })

  it('accepts an already-parsed object', () => {
    expect(parseMetroStats(SAMPLE_STATS)?.modules).toHaveLength(5)
  })

  it('returns null for invalid input', () => {
    expect(parseMetroStats('not json')).toBeNull()
    expect(parseMetroStats('{}')).toBeNull()
    expect(parseMetroStats(null as unknown as string)).toBeNull()
  })
})

describe('analyzeBundleStats', () => {
  it('aggregates per-package sizes and total', () => {
    const analysis = analyzeBundleStats(parseMetroStats(SAMPLE_STATS) as never)
    expect(analysis.totalSize).toBe(50000 + 150000 + 20000 + 3000 + 500)
    expect(analysis.moduleCount).toBe(5)
    const reanimated = analysis.packages.find(p => p.name === 'reanimated')
    expect(reanimated?.size).toBe(170000)
    expect(reanimated?.moduleCount).toBe(2)
    // Sorted desc — the largest package first.
    expect(analysis.packages[0].name).toBe('reanimated')
    expect(analysis.largestModules[0].name).toBe('node_modules/reanimated/index.js')
    expect(analysis.assets).toHaveLength(2)
  })
})

describe('packageFromModulePath', () => {
  it('extracts scoped and plain packages', () => {
    expect(packageFromModulePath('/app/node_modules/@sentry/react-native/dist/index.js', 'x')).toBe('@sentry/react-native')
    expect(packageFromModulePath('/app/node_modules/axios/lib/index.js', 'x')).toBe('axios')
  })
})

describe('checkBundleBudgets', () => {
  it('flags libraries over 100KB and oversized assets', () => {
    const analysis = analyzeBundleStats(parseMetroStats(SAMPLE_STATS) as never)
    const findings = checkBundleBudgets(analysis)
    const large = findings.find(f => f.rule === 'large-library')
    expect(large).toBeDefined()
    expect(large?.message).toContain('reanimated')
    expect(large?.message).toContain('166 KB') // 170000 bytes
    const asset = findings.find(f => f.rule === 'large-asset')
    expect(asset).toBeDefined()
    expect(asset?.message).toContain('splash.png')
    // react-native is exempted from the large-library rule.
    expect(findings.some(f => f.message.includes('"react-native"'))).toBe(false)
  })

  it('respects a custom threshold', () => {
    const analysis = analyzeBundleStats(parseMetroStats(SAMPLE_STATS) as never)
    const findings = checkBundleBudgets(analysis, { largeLibBytes: 200 * 1024 })
    expect(findings.filter(f => f.rule === 'large-library')).toHaveLength(0)
  })
})

describe('checkStaticBudgets', () => {
  let dir: string

  afterEach(() => {
    cleanup(dir)
  })

  it('flags dependencies missing sideEffects: false', () => {
    dir = createTempProject({
      'package.json': JSON.stringify({
        name: 'app',
        version: '1.0.0',
        dependencies: {
          'react-native': '0.74.0',
          'good-lib': '1.0.0',
          'side-effect-lib': '2.0.0',
        },
      }),
      'node_modules/good-lib/package.json': JSON.stringify({ name: 'good-lib', version: '1.0.0', sideEffects: false }),
      'node_modules/side-effect-lib/package.json': JSON.stringify({ name: 'side-effect-lib', version: '2.0.0' }),
    })
    const result = checkStaticBudgets(dir)
    expect(result.checkedPackages).toBe(2)
    const missing = result.findings.find(f => f.rule === 'missing-side-effects')
    expect(missing).toBeDefined()
    expect(missing?.message).toContain('side-effect-lib')
    expect(result.findings.some(f => f.message.includes('good-lib'))).toBe(false)
  })

  it('resolves hoisted node_modules in a monorepo for the sideEffects check', () => {
    dir = createTempProject({
      'pnpm-workspace.yaml': 'packages:\n  - "packages/*"\n',
      'package.json': JSON.stringify({ name: 'root', version: '1.0.0', private: true }),
      // Deps are hoisted to the workspace root — no local node_modules here.
      'node_modules/hoisted-lib/package.json': JSON.stringify({ name: 'hoisted-lib', version: '1.0.0' }),
      'packages/mobile/package.json': JSON.stringify({
        name: 'mobile',
        version: '1.0.0',
        dependencies: { 'react-native': '0.76.0', 'hoisted-lib': '1.0.0' },
      }),
    })
    const result = checkStaticBudgets(join(dir, 'packages', 'mobile'))
    expect(result.checkedPackages).toBe(1)
    const missing = result.findings.find(f => f.rule === 'missing-side-effects')
    expect(missing).toBeDefined()
    expect(missing?.message).toContain('hoisted-lib')
  })

  it('falls back to the local store for non-hoisted deps in a workspace', () => {
    dir = createTempProject({
      'pnpm-workspace.yaml': 'packages:\n  - "packages/*"\n',
      'package.json': JSON.stringify({ name: 'root', version: '1.0.0', private: true }),
      // A hoisted store exists, but this dep is pinned locally in the app.
      'node_modules/hoisted-lib/package.json': JSON.stringify({ name: 'hoisted-lib', version: '1.0.0', sideEffects: false }),
      'packages/mobile/package.json': JSON.stringify({
        name: 'mobile',
        version: '1.0.0',
        dependencies: { 'react-native': '0.76.0', 'hoisted-lib': '1.0.0', 'local-only': '1.0.0' },
      }),
      'packages/mobile/node_modules/local-only/package.json': JSON.stringify({ name: 'local-only', version: '1.0.0' }),
    })
    const result = checkStaticBudgets(join(dir, 'packages', 'mobile'))
    expect(result.checkedPackages).toBe(2)
    // The local-only dep (no sideEffects flag) is still flagged.
    expect(result.findings.some(f => f.message.includes('local-only'))).toBe(true)
    // The hoisted dep with sideEffects: false is not flagged.
    expect(result.findings.some(f => f.message.includes('hoisted-lib'))).toBe(false)
  })

  it('flags unoptimized images and oversized assets', () => {
    dir = createTempProject({
      'package.json': JSON.stringify({ name: 'app', version: '1.0.0', dependencies: {} }),
      // 300KB PNG
      'assets/hero.png': 'x'.repeat(300 * 1024),
      // 500KB WebP — already optimized, exempt
      'assets/bg.webp': 'x'.repeat(500 * 1024),
      // 2MB font
      'assets/font.ttf': 'x'.repeat(2 * 1024 * 1024),
    })
    const result = checkStaticBudgets(dir)
    const image = result.findings.find(f => f.rule === 'unoptimized-image')
    expect(image).toBeDefined()
    expect(image?.message).toContain('hero.png')
    expect(result.findings.some(f => f.message.includes('bg.webp'))).toBe(false)
    const asset = result.findings.find(f => f.rule === 'oversized-asset')
    expect(asset).toBeDefined()
    expect(asset?.message).toContain('font.ttf')
  })
})

describe('formatting', () => {
  it('formats bytes and percentages', () => {
    expect(formatBytes(500)).toBe('500 B')
    expect(formatBytes(1024)).toBe('1.0 KB')
    expect(formatBytes(170000)).toBe('166 KB')
    expect(formatBytes(2 * 1024 * 1024)).toBe('2.0 MB')
    expect(formatPct(12)).toBe('+12.0%')
    expect(formatPct(-3.5)).toBe('-3.5%')
  })
})
