import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { readProjectIntel, buildApplicationModel, renderApplicationModel } from '../../src/intel/model'
import { intelDocsDir, runProjectIntel } from '../../src/intel'
import { readProjectContext, diagnose } from '../../src/fix/diagnose'
import type { IntelReport } from '../../src/intel/types'
import { planEdits } from '../../src/fix/planner'

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), 'vc-intel-test-'))
}

/** A hand-built but shape-complete intel report (fields under test are real). */
function syntheticReport(): IntelReport {
  return {
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    durationMs: 1,
    manifest: {
      schemaVersion: 2,
      version: '1.0.0',
      projectName: 'fixture-app',
      rnVersion: '0.76.5',
      tooling: 'rn-cli',
      dependencies: {
        react: '18.3.1',
        'react-native': '0.76.5',
        'react-native-ble': '^1.0.0',
        'expo-camera': '^14.0.0',
      },
      initializedAt: Date.now(),
    },
    manifestIssues: [],
    workspace: { isMonorepo: false } as unknown as IntelReport['workspace'],
    dependencyGraph: {
      nodes: ['a.ts'],
      internalEdges: [],
      external: [],
      cycles: [{ members: ['a', 'b'], example: 'a -> b -> a' }],
    } as unknown as IntelReport['dependencyGraph'],
    ast: { filesScanned: 42, filesParsed: 40, filesFailed: 2, parseRate: 0.95, imports: 120, exports: 30 },
    index: { scanned: 42, changed: 0, added: 0, unchanged: 42, incremental: true } as unknown as IntelReport['index'],
    knowledge: {
      components: [
        { id: 'a#HomeScreen', name: 'HomeScreen', filePath: 'src/screens/HomeScreen.tsx' },
        { id: 'a#ProfileScreen', name: 'ProfileScreen', filePath: 'src/screens/ProfileScreen.tsx' },
      ],
      navigators: [
        {
          filePath: 'src/navigation/AppNavigator.tsx',
          name: 'RootStack',
          type: 'native-stack',
          screens: [
            { name: 'Home', component: 'HomeScreen' },
            { name: 'Profile', component: 'ProfileScreen' },
          ],
        },
      ],
      stores: [{ name: 'ThemeContext', kind: 'context', filePath: 'src/store/theme.tsx', consumers: [] }],
      nativeModules: [{ filePath: 'src/native.ts', modules: ['Settings'] }],
      edges: [],
      hooks: [],
      expoRoutes: [],
      reRenderImpact: [],
      platformVariants: [],
    } as unknown as IntelReport['knowledge'],
    navigation: {
      navigators: [
        {
          filePath: 'src/navigation/AppNavigator.tsx',
          name: 'RootStack',
          type: 'native-stack',
          screens: [
            { name: 'Home', component: 'HomeScreen' },
            { name: 'Profile', component: 'ProfileScreen' },
          ],
        },
      ],
      expoRoutes: [{ route: '/login', filePath: 'app/login.tsx', isLayout: false }],
      urlScheme: 'fixture',
      deepLinks: ['fixture://login'],
    } as unknown as IntelReport['navigation'],
    nativeRegistry: {
      entries: [{ name: 'Settings', jsRefs: ['src/native.ts'], pod: true, podspec: null, gradleInclude: false, gradleDependency: false, turboModuleSpec: false, referenced: true }],
      podfilePods: ['RNSettings'],
      podspecs: [],
      gradleIncludes: [],
      totals: { js: 1, pods: 1, podspecs: 0, turboSpecs: 0 },
    },
    retrieval: { indexedChunks: 0, indexedFiles: 0, buildMs: 0 } as unknown as IntelReport['retrieval'],
    timings: [],
  }
}

describe('intel as the foundation — application model', () => {
  it('derives the application digest from the intel report', () => {
    const model = buildApplicationModel(syntheticReport())
    expect(model.name).toBe('fixture-app')
    expect(model.rnVersion).toBe('0.76.5')
    expect(model.tooling).toBe('rn-cli')
    // Screens from navigators + expo routes, deduped.
    expect(model.screens.map(s => s.name).sort()).toEqual(['Home', 'Profile', 'login'])
    expect(model.screens.find(s => s.name === 'Home')?.file).toBe('src/screens/HomeScreen.tsx')
    expect(model.navigators).toEqual(['RootStack'])
    expect(model.expoRoutes).toEqual(['/login'])
    expect(model.stateStores.map(s => s.name)).toEqual(['ThemeContext'])
    expect(model.nativeModules).toEqual(['Settings'])
    // Dependencies with the native flag.
    const ble = model.dependencies.find(d => d.name === 'react-native-ble')
    expect(ble?.native).toBe(true)
    const react = model.dependencies.find(d => d.name === 'react')
    expect(react?.native).toBe(false)
    expect(model.sourceFiles).toBe(42)
    expect(model.cycles).toBe(1)
  })

  it('renders the moat visual (the "application" tree)', () => {
    const rendered = renderApplicationModel(buildApplicationModel(syntheticReport()))
    expect(rendered).toContain('application')
    expect(rendered).toContain('screens')
    expect(rendered).toContain('native modules')
    expect(rendered).toContain('dependencies')
    expect(rendered).toContain('architecture')
  })
})

describe('intel as the foundation — the shared accessor', () => {
  it('returns the cached model when it is fresh', () => {
    const root = tempDir()
    try {
      const dir = intelDocsDir(root)
      mkdirSync(dir, { recursive: true })
      const report = syntheticReport()
      writeFileSync(join(dir, 'report.json'), JSON.stringify(report))
      const access = readProjectIntel(root)
      expect(access.fromCache).toBe(true)
      expect(access.reason).toBe('cached')
      expect(access.report?.manifest.projectName).toBe('fixture-app')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('re-runs one fresh pass when the cache is stale (or missing)', () => {
    const root = tempDir()
    try {
      writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'x', version: '1.0.0', dependencies: { 'react-native': '0.76.5' } }))
      const access = readProjectIntel(root, { maxAgeMs: 0 })
      expect(access.reason).toBe('fresh')
      expect(access.report).not.toBeNull()
      expect(access.report?.manifest.projectName).toBeTruthy()
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('runs the real intel pipeline end-to-end on a small project', () => {
    const root = tempDir()
    try {
      mkdirSync(join(root, 'src'), { recursive: true })
      writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'tiny', version: '1.0.0', dependencies: { 'react-native': '0.76.5' } }))
      writeFileSync(join(root, 'src', 'App.tsx'), "import React from 'react'; export default function App() { return null }")
      const { report } = runProjectIntel(root)
      const model = buildApplicationModel(report)
      expect(model.name).toBe('tiny')
      expect(model.sourceFiles).toBeGreaterThanOrEqual(1)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

describe('intel as the foundation — fix consumes the model', () => {
  it('uses the intel manifest instead of re-reading package.json', () => {
    const root = tempDir()
    try {
      // package.json disagrees with the model — the model must win.
      writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'x', version: '1.0.0', dependencies: { 'react-native': '0.72.0' } }))
      const ctx = readProjectContext(root, syntheticReport())
      expect(ctx.rnVersion).toBe(0.76)
      expect(ctx.flavor).toBe('rn-cli')
      expect(ctx.dependencies['react-native']).toBe('0.76.5')
      expect(ctx.nativeModules).toContain('Settings') // from the native registry
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('routes diagnose through the shared model and still finds the kotlin root cause', () => {
    const root = tempDir()
    try {
      mkdirSync(join(root, 'android', 'gradle', 'wrapper'), { recursive: true })
      writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'x', version: '1.0.0', dependencies: { 'react-native': '0.72.0' } }))
      writeFileSync(
        join(root, 'android', 'build.gradle'),
        'buildscript { ext { compileSdkVersion = 34; kotlinVersion = "1.8.0" } dependencies { classpath("com.android.tools.build:gradle:8.1.0") } }'
      )
      writeFileSync(
        join(root, 'android', 'gradle', 'wrapper', 'gradle-wrapper.properties'),
        'distributionUrl=https\\://services.gradle.org/distributions/gradle-8.4-bin.zip\n'
      )
      const { findings } = diagnose(root, { issue: 'Android build started failing after upgrading RN — react-native-x requires Kotlin >= 1.9.24' })
      const kotlin = findings.find(f => f.id === 'kotlin-version')
      expect(kotlin).toBeDefined()
      // The model (fresh pass) supplies RN 0.76 — the kotlin target is 1.9.24.
      const edits = planEdits(root, findings)
      expect(edits.some(e => e.summary.includes('Upgrade Kotlin 1.8.0 → 1.9.24'))).toBe(true)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('still works when the model is unavailable (falls back to direct reads)', () => {
    const root = tempDir()
    try {
      writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'x', version: '1.0.0', dependencies: { 'react-native': '0.76.5' } }))
      const ctx = readProjectContext(root, null)
      expect(ctx.rnVersion).toBe(0.76)
      expect(ctx.flavor).toBe('rn-cli')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
