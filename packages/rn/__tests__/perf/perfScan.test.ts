/**
 * Static performance scan tests — roadmap 021-023, 027, 029.
 * Business Source License 1.1 (BSL-1.1)
 */
import { mkdirSync, writeFileSync, rmSync } from 'fs'
import { join } from 'path'
import { scanRenderHazards } from '../../src/perfScan/render'
import { scanStartupHazards } from '../../src/perfScan/startup'
import { scanBridgeHazards } from '../../src/perfScan/bridge'
import { runPerfScan, summarizePerfScan, renderPerfMarkdown, writePerfReport } from '../../src/perfScan'

let tmp: string
beforeEach(() => {
  tmp = join(__dirname, '.tmp-perf')
  rmSync(tmp, { recursive: true, force: true })
  mkdirSync(tmp, { recursive: true })
})
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true })
})

function write(rel: string, content: string): void {
  const full = join(tmp, rel)
  mkdirSync(join(full, '..'), { recursive: true })
  writeFileSync(full, content)
}

const ids = (fs: { id: string }[]): string[] => fs.map(f => f.id).sort()

describe('render hazards (021/022)', () => {
  test('flags multiple inline arrow handlers on one element', () => {
    const content = `
const Row = () => (
  <TouchableOpacity onPress={() => go(1)} onLongPress={() => go(2)}>
    <Text>hi</Text>
  </TouchableOpacity>
)`
    const findings = scanRenderHazards(content, 'src/Row.tsx')
    expect(ids(findings)).toContain('inline-arrow-handlers')
    const f = findings.find(x => x.id === 'inline-arrow-handlers')
    expect(f?.metric).toMatch(/2 inline handler/)
  })

  test('flags inline object/array literals passed as props', () => {
    const content = `
const Card = () => <View style={{ flex: 1 }} data={[1, 2, 3]} />`
    const findings = scanRenderHazards(content, 'src/Card.tsx')
    expect(ids(findings)).toContain('inline-object-literals')
  })

  test('flags setState called directly in the render body', () => {
    const content = `
function Counter() {
  const [count, setCount] = useState(0)
  setCount(count + 1)
  return <Text>{count}</Text>
}`
    const findings = scanRenderHazards(content, 'src/Counter.tsx')
    expect(ids(findings)).toContain('set-state-during-render')
    const f = findings.find(x => x.id === 'set-state-during-render')
    expect(f?.severity).toBe('error')
    expect(f?.roadmap).toBe('021')
  })

  test('flags unmemoized context provider values', () => {
    const content = `
export const App = () => (
  <Settings.Provider value={{ theme: 'dark', user: currentUser }}>
    <Home />
  </Settings.Provider>
)`
    const findings = scanRenderHazards(content, 'src/App.tsx')
    expect(ids(findings)).toContain('unmemoized-context-value')
  })

  test('ignores plain files and single inline handlers', () => {
    expect(scanRenderHazards('const a = 1', 'src/util.ts')).toHaveLength(0)
    const ok = scanRenderHazards('<Button onPress={handle} />', 'src/Ok.tsx')
    expect(ids(ok)).not.toContain('inline-arrow-handlers')
  })
})

describe('startup hazards (023)', () => {
  test('flags heavy packages imported at module scope', () => {
    const content = `import moment from 'moment'
import { map } from 'lodash'
export const App = () => <Text>hi</Text>`
    const findings = scanStartupHazards(content, 'src/App.tsx')
    const heavy = findings.filter(f => f.id === 'heavy-import-at-module-scope')
    expect(heavy.map(f => f.target).sort()).toEqual(['lodash', 'moment'])
  })

  test('flags top-level side effects only in entry files', () => {
    const entry = `import { init } from './sdk'
init()
console.log('boot')`
    const entryFindings = scanStartupHazards(entry, 'index.ts')
    expect(ids(entryFindings)).toContain('top-level-side-effect')

    const nonEntry = `import { init } from './sdk'
init()`
    const nonEntryFindings = scanStartupHazards(nonEntry, 'src/lib/boot.ts')
    expect(ids(nonEntryFindings)).not.toContain('top-level-side-effect')
  })
})

describe('bridge hazards (027)', () => {
  test('flags requireNativeComponent', () => {
    const content = `const MyView = requireNativeComponent('MyView')`
    const findings = scanBridgeHazards(content, 'src/MyView.ts')
    expect(ids(findings)).toContain('require-native-component')
  })

  test('flags direct NativeModules calls (warning in JSX files)', () => {
    const content = `NativeModules.Analytics.logEvent('x')`
    const tsx = scanBridgeHazards(content, 'src/Home.tsx')
    const ts = scanBridgeHazards(content, 'src/services/analytics.ts')
    const tsxFinding = tsx.find(f => f.id === 'direct-bridge-call')
    const tsFinding = ts.find(f => f.id === 'direct-bridge-call')
    expect(tsxFinding?.severity).toBe('warning')
    expect(tsFinding?.severity).toBe('info')
  })
})

describe('perfScan runner (021-029)', () => {
  test('runs all three analyzers and writes reports', () => {
    write('package.json', JSON.stringify({ name: 'perf-app', dependencies: { 'react-native': '0.76.5' } }))
    write('src/App.tsx', `
import moment from 'moment'
import { useState } from 'react'
const App = () => {
  const [n, setN] = useState(0)
  setN(n + 1)
  return <View style={{ flex: 1 }}><Button onPress={() => run()} onLongPress={() => run2()} /></View>
}`
    )
    const report = runPerfScan(tmp)
    expect(report.fileCount).toBe(1) // walkProjectFiles counts source files only; package.json is not one
    expect(report.summary.total).toBeGreaterThanOrEqual(3)
    const cats = report.summary.byCategory
    expect(cats.render).toBeGreaterThanOrEqual(1)
    expect(cats.startup).toBeGreaterThanOrEqual(1)
    // setState-during-render should rank as the top error
    expect(report.findings[0]?.severity).toBe('error')

    const md = renderPerfMarkdown(report)
    expect(md).toContain('# vectalon perf')
    expect(md).toContain('Top recommendations')

    const { jsonPath, mdPath } = writePerfReport(tmp, report)
    expect(jsonPath.endsWith('docs/vectalon/perf/report.json')).toBe(true)
    expect(mdPath.endsWith('docs/vectalon/perf/report.md')).toBe(true)
  })

  test('clean project yields zero findings', () => {
    write('package.json', JSON.stringify({ name: 'clean-app', dependencies: { 'react-native': '0.76.5' } }))
    write('src/App.tsx', `const App = () => <Text>hi</Text>`)
    const report = runPerfScan(tmp)
    expect(report.summary.total).toBe(0)
    expect(report.summary.topRecommendations).toEqual([])
  })

  test('summarizePerfScan dedupes recommendations and ranks severity', () => {
    const findings = [
      { id: 'a', severity: 'info', file: 'f.ts', line: 1, suggestion: 's1', category: 'render', roadmap: '022', target: 't', metric: 'm', message: 'm' },
      { id: 'a', severity: 'info', file: 'f.ts', line: 1, suggestion: 's1', category: 'render', roadmap: '022', target: 't', metric: 'm', message: 'm' },
      { id: 'b', severity: 'error', file: 'g.ts', line: 2, suggestion: 's2', category: 'startup', roadmap: '023', target: 't', metric: 'm', message: 'm' },
    ] as Parameters<typeof summarizePerfScan>[0]
    const summary = summarizePerfScan(findings)
    expect(summary.total).toBe(3)
    expect(summary.bySeverity.error).toBe(1)
    expect(summary.topRecommendations[0]).toContain('s2') // error ranks first
    expect(summary.topRecommendations.length).toBe(2) // deduped
  })
})
