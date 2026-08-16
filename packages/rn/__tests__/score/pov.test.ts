import { buildPovCounts, renderPovWindow, renderScanSummary } from '../../src/score/pov'
import type { ScoreReport } from '../../src/score'
import type { IntelReport } from '../../src/intel/types'

/** Minimal intel report — only the fields the PoV reads (cast for brevity). */
function mockIntel(): IntelReport {
  return {
    generatedAt: new Date(0).toISOString(),
    durationMs: 10,
    manifest: {
      version: '1.0.0',
      projectName: 'mock',
      rnVersion: '0.76.5',
      tooling: 'rn-cli',
      dependencies: { react: '18.3.1', 'react-native': '0.76.5', 'react-native-ble': '^1.0.0' },
      initializedAt: 0,
    },
    manifestIssues: [],
    dependencyGraph: { nodes: [], internalEdges: [], external: [], unresolved: [], cycles: [] },
    ast: { filesScanned: 1842, filesParsed: 1830, filesFailed: 12, parseRate: 0.993, imports: 500, exports: 120 },
    index: { scanned: 1842, changed: 0, added: 0, unchanged: 0, incremental: false },
    knowledge: {
      components: [],
      edges: [],
      hooks: [],
      navigators: [],
      nativeModules: [],
      stores: [],
      expoRoutes: [],
      reRenderImpact: [],
      platformVariants: [],
    },
    navigation: {
      navigators: [{ filePath: 'nav.tsx', name: 'Root', type: 'stack', screens: [{ name: 'Home', component: 'App' }] }],
      expoRoutes: [],
      urlScheme: null,
      deepLinks: [],
    },
    nativeRegistry: { entries: [] },
    retrieval: { indexedChunks: 10, indexedFiles: 1842, buildMs: 5 },
    timings: [],
    schemaVersion: 1,
    workspace: { isMonorepo: false, manager: null, root: null, patterns: [], packages: [] },
  } as unknown as IntelReport
}

function mockScore(over: Partial<ScoreReport> = {}): ScoreReport {
  return {
    scoredAt: 0,
    root: '/x',
    overall: 76,
    grade: 'C',
    verdict: 'good',
    delta: null,
    newProblems: [],
    historyNote: 'First score — no previous run to compare against',
    dimensions: [],
    recommendations: [
      { priority: 'P0', dimension: 'Dependencies', message: 'Android dependency conflict', action: 'fix it' },
      { priority: 'P0', dimension: 'Architecture', message: 'Circular dependency', action: 'break it' },
      { priority: 'P1', dimension: 'Testing', message: 'Checkout has no E2E coverage', action: 'add it' },
      { priority: 'P1', dimension: 'Performance', message: '3 unnecessary render cycles', action: 'memoize' },
      { priority: 'P2', dimension: 'Upgrade', message: 'RN upgrade risk detected', action: 'plan it' },
    ],
    ...over,
  }
}

describe('vc init — proof of value', () => {
  it('builds the scan counts from intel + the test walk', () => {
    const counts = buildPovCounts('/x', mockIntel(), mockScore())
    expect(counts.files).toBe(1842)
    expect(counts.components).toBe(0)
    expect(counts.screens).toBe(1)
    expect(counts.nativeModules).toBe(0)
    expect(counts.dependencies).toBe(3)
    expect(counts.navigationStacks).toBe(1)
    expect(counts.tests).toBe(0)
    expect(counts.architectureRisks).toBe(0)
  })

  it('falls back to zeros when intel is unavailable', () => {
    const counts = buildPovCounts('/x', null, mockScore())
    expect(counts.files).toBe(0)
    expect(counts.components).toBe(0)
    expect(counts.screens).toBe(0)
  })

  it('renders the scan summary lines with the ✓ prefix', () => {
    const lines = renderScanSummary({ files: 1842, components: 127, screens: 34, nativeModules: 18, dependencies: 412, navigationStacks: 6, tests: 23, architectureRisks: 4 })
    const text = lines.join('\n')
    expect(text).toContain('Scanning React Native project…')
    expect(text).toContain('1842')
    for (const label of ['files', 'components', 'screens', 'native modules', 'dependencies', 'navigation stacks', 'tests', 'architecture risks']) {
      expect(text).toContain(label)
    }
  })

  it('renders the top 5 problems with severity dots and the score line', () => {
    const score = mockScore()
    const window = renderPovWindow('/x', score, mockIntel())
    expect(window).toContain('Vectalon Health Score:')
    expect(window).toContain('76/100')
    expect(window).toContain('Top problems Vectalon found:')
    expect(window).toContain('Android dependency conflict')
    expect(window).toContain('RN upgrade risk detected')
    // P0/P1/P2 all present in order.
    const idxP0 = window.indexOf('1.')
    const idxP1 = window.indexOf('3.')
    const idxP2 = window.indexOf('5.')
    expect(idxP0).toBeGreaterThan(-1)
    expect(idxP1).toBeGreaterThan(idxP0)
    expect(idxP2).toBeGreaterThan(idxP1)
  })

  it('adds the "and N more" line when recommendations exceed the top 5', () => {
    const score = mockScore({ recommendations: [
      { priority: 'P0', dimension: 'd', message: 'm1', action: 'a' },
      { priority: 'P0', dimension: 'd', message: 'm2', action: 'a' },
      { priority: 'P0', dimension: 'd', message: 'm3', action: 'a' },
      { priority: 'P0', dimension: 'd', message: 'm4', action: 'a' },
      { priority: 'P0', dimension: 'd', message: 'm5', action: 'a' },
      { priority: 'P1', dimension: 'd', message: 'm6', action: 'a' },
      { priority: 'P1', dimension: 'd', message: 'm7', action: 'a' },
    ] })
    const window = renderPovWindow('/x', score, null)
    expect(window).toContain('… and 2 more')
  })

  it('renders the no-problems message when nothing is found', () => {
    const score = mockScore({ recommendations: [], overall: 92, grade: 'A', verdict: 'excellent' })
    const window = renderPovWindow('/x', score, mockIntel())
    expect(window).toContain('No problems found')
  })
})
