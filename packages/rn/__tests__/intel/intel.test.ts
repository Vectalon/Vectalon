/**
 * Project Intelligence Core tests (Roadmap 001-010): manifest, workspace,
 * dependency graph + cycles, AST stats, incremental index, component /
 * navigation graphs, native registry, and retrieval benchmark.
 * Business Source License 1.1 (BSL-1.1)
 */
import { tmpdir } from 'os'
import { join } from 'path'
import { writeFileSync, mkdirSync, rmSync, existsSync, readdirSync } from 'fs'
import { buildDependencyGraph, findCycles, packageFromSpecifier } from '../../src/intel/dependencyGraph'
import { buildNativeRegistry } from '../../src/intel/nativeRegistry'
import { chunkSource, buildRetrievalIndex, retrieve, runRetrievalBench } from '../../src/intel/retrieval'
import { runProjectIntel, renderIntelMarkdown } from '../../src/intel'
import { buildProjectManifest, validateProjectManifest } from '../../src/projectManifest'

let seq = 0
function tempProject(): string {
  const dir = join(tmpdir(), `vectalon-intel-${Date.now()}-${seq++}`)
  mkdirSync(join(dir, 'src', 'screens'), { recursive: true })
  mkdirSync(join(dir, 'src', 'components'), { recursive: true })
  mkdirSync(join(dir, 'src', 'services'), { recursive: true })
  mkdirSync(join(dir, 'src', 'specs'), { recursive: true })
  mkdirSync(join(dir, 'ios'), { recursive: true })
  mkdirSync(join(dir, 'android'), { recursive: true })
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'intel-app', version: '1.0.0', dependencies: { 'react-native': '0.76.0', axios: '^1.7.0' } }))
  writeFileSync(join(dir, 'App.tsx'), `import React from 'react'\nimport { HomeScreen } from './src/screens/Home'\nexport default function App() { return <HomeScreen /> }\n`)
  writeFileSync(join(dir, 'src', 'screens', 'Home.tsx'), `import React from 'react'\nimport { NativeModules } from 'react-native'\nimport { Card } from '../components/Card'\nimport { fetchUsers } from '../services/api'\nexport function HomeScreen() { return <Card title="hi" /> }\nexport const SettingsNative = NativeModules.Settings\n`)
  writeFileSync(join(dir, 'src', 'components', 'Card.tsx'), `import React from 'react'\nexport function Card({ title }: { title: string }) { return <Text>{title}</Text> }\n`)
  writeFileSync(join(dir, 'src', 'services', 'api.ts'), `import axios from 'axios'\nexport async function fetchUsers() { return axios.get('/users') }\n`)
  writeFileSync(join(dir, 'src', 'specs', 'NativeSettings.ts'), `import { TurboModuleRegistry, type TurboModule } from 'react-native'\nexport interface Spec extends TurboModule { getTheme(): string }\nexport default TurboModuleRegistry.getEnforcing<Spec>('Settings')\n`)
  writeFileSync(join(dir, 'ios', 'Podfile'), `platform :ios, '15.0'\nuse_native_modules!\n\npod 'RNCSafeAreaContext'\n`)
  writeFileSync(join(dir, 'android', 'settings.gradle'), `rootProject.name = 'intel-app'\ninclude ':app'\ninclude ':react-native-safe-area-context'\n`)
  return dir
}

describe('003 dependency graph', () => {
  it('builds internal edges, external packages, and resolves relative imports', () => {
    const root = tempProject()
    const graph = buildDependencyGraph(root)
    expect(graph.nodes).toContain('src/screens/Home.tsx')
    expect(graph.nodes).toContain('App.tsx')
    expect(graph.internalEdges).toContainEqual({ from: 'App.tsx', to: 'src/screens/Home.tsx' })
    expect(graph.internalEdges).toContainEqual({ from: 'src/screens/Home.tsx', to: 'src/components/Card.tsx' })
    expect(graph.internalEdges).toContainEqual({ from: 'src/screens/Home.tsx', to: 'src/services/api.ts' })
    expect(graph.external.some(e => e.package === 'axios')).toBe(true)
    expect(graph.external.some(e => e.package === 'react-native')).toBe(true)
    expect(graph.cycles).toEqual([])
  })

  it('detects circular imports via SCC', () => {
    const root = tempProject()
    writeFileSync(join(root, 'src', 'a.ts'), `import { b } from './b'\nexport const a = b + 1\n`)
    writeFileSync(join(root, 'src', 'b.ts'), `import { a } from './a'\nexport const b = a + 1\n`)
    const graph = buildDependencyGraph(root)
    expect(graph.cycles.length).toBeGreaterThan(0)
    const cycle = graph.cycles.find(c => c.nodes.includes('src/a.ts'))
    expect(cycle).toBeDefined()
    expect(cycle!.example).toContain('src/a.ts ->')
  })

  it('findCycles handles self-loops and packageFromSpecifier scopes', () => {
    const edges = [{ from: 'x', to: 'x' }, { from: 'p/a', to: 'p/b' }, { from: 'p/b', to: 'p/a' }]
    const cycles = findCycles(edges, new Set(['x', 'p/a', 'p/b']))
    expect(cycles.some(c => c.nodes.includes('x'))).toBe(true)
    expect(cycles.some(c => c.nodes.includes('p/a') && c.nodes.includes('p/b'))).toBe(true)
    expect(packageFromSpecifier('@scope/name/rest')).toBe('@scope/name')
    expect(packageFromSpecifier('axios/lib/adapters')).toBe('axios')
  })
})

describe('001 manifest', () => {
  it('builds a versioned canonical manifest and validates it', () => {
    const root = tempProject()
    const manifest = buildProjectManifest(root)
    expect(manifest.schemaVersion).toBe(2)
    expect(manifest.projectName).toBe('intel-app')
    expect(manifest.tooling).toBe('rn-cli')
    expect(manifest.dependencies?.['react-native']).toBe('0.76.0')
    expect(validateProjectManifest(manifest)).toEqual([])
    expect(validateProjectManifest(null).length).toBeGreaterThan(0)
    const issues = validateProjectManifest({ ...manifest, rnVersion: '' })
    expect(issues.some(i => i.startsWith('rnVersion is empty'))).toBe(true)
  })
})

describe('009 native registry', () => {
  it('matches JS refs, pods, podspecs, gradle includes, and TurboModule specs', () => {
    const root = tempProject()
    const registry = buildNativeRegistry(root)
    const settings = registry.entries.find(e => e.name === 'Settings' || e.name === 'NativeSettings')
    expect(settings).toBeDefined()
    expect(settings!.jsRefs.length).toBeGreaterThan(0)
    expect(settings!.turboModuleSpec).toBe(true)
    expect(registry.podfilePods).toContain('RNCSafeAreaContext')
    expect(registry.gradleIncludes).toContain('react-native-safe-area-context')
    expect(registry.totals.turboSpecs).toBeGreaterThan(0)
  })
})

describe('006/010 retrieval', () => {
  it('chunks large files with overlap', () => {
    const big = Array.from({ length: 500 }, (_, i) => `line ${i} component api store`).join('\n')
    const chunks = chunkSource('src/Big.ts', big)
    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks[0].title).toBe('src/Big.ts#L1-200')
    // Overlap: chunk 2 starts before line 201.
    expect(chunks[1].content).toContain('line 181')
  })

  it('searches the indexed project and stays sub-second', async () => {
    const root = tempProject()
    const { index, report: build } = buildRetrievalIndex(root, ['src/screens/Home.tsx', 'src/components/Card.tsx', 'src/services/api.ts'])
    expect(build.indexedChunks).toBe(3)
    const hit = retrieve(index, 'fetch users', 5)
    expect(hit.results.length).toBeGreaterThan(0)
    expect(hit.results[0].title).toBe('src/services/api.ts')
    expect(hit.ms).toBeLessThan(1000)
    const bench = runRetrievalBench(root, ['src/screens/Home.tsx', 'src/components/Card.tsx', 'src/services/api.ts'])
    expect(bench.bench.subSecond).toBe(true)
    expect(bench.bench.maxMs).toBeLessThan(1000)
  })
})

describe('runProjectIntel end-to-end (001-010)', () => {
  it('produces every layer and writes report.json + report.md', () => {
    const root = tempProject()
    const { report, reportPath } = runProjectIntel(root, {})
    expect(report.schemaVersion).toBe(2)
    expect(report.manifest.projectName).toBe('intel-app')
    expect(report.dependencyGraph.nodes.length).toBeGreaterThan(0)
    expect(report.ast.filesScanned).toBeGreaterThan(0)
    expect(report.ast.parseRate).toBeGreaterThanOrEqual(0.9)
    expect(report.knowledge.components.length).toBeGreaterThan(0)
    expect(report.nativeRegistry.entries.length).toBeGreaterThan(0)
    expect(report.retrieval.indexedChunks).toBeGreaterThan(0)
    expect(existsSync(join(reportPath))).toBe(true)
    expect(existsSync(join(root, 'docs', 'vectalon', 'intel', 'report.md'))).toBe(true)
    expect(renderIntelMarkdown(report)).toContain('001 Manifest')
  })

  it('re-indexes incrementally on the second run', () => {
    const root = tempProject()
    const first = runProjectIntel(root, {})
    expect(first.report.index.incremental).toBe(false)
    const second = runProjectIntel(root, {})
    expect(second.report.index.incremental).toBe(true)
    expect(second.report.index.unchanged).toBeGreaterThan(0)
    expect(second.report.index.changed).toBe(0)
    // Touch one file → next run re-indexes exactly it.
    writeFileSync(join(root, 'src', 'components', 'Card.tsx'), `export function Card() { return null }\n`)
    const third = runProjectIntel(root, {})
    expect(third.report.index.changed).toBeGreaterThan(0)
  })

  it('runs --bench and --search through the report', () => {
    const root = tempProject()
    const { report } = runProjectIntel(root, { bench: true, search: 'native settings' })
    expect(report.retrieval.bench).toBeDefined()
    expect(report.retrieval.bench!.subSecond).toBe(true)
    expect(report.retrieval.query).toBeDefined()
  })

  afterEach(() => {
    // Cleanup temp projects.
    const base = tmpdir()
    try {
      for (const name of readdirSync(base)) {
        if (name.startsWith('vectalon-intel-')) rmSync(join(base, name), { recursive: true, force: true })
      }
    } catch {
      /* best-effort */
    }
  })
})
