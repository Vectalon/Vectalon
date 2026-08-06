import { existsSync } from 'fs'
import { join } from 'path'
import { ContextEngine } from '../../src/harness/ContextEngine'
import type { Pattern, PatternStore } from '../../src/memory/PatternLearner'
import { createTempProject, cleanup } from '../helpers/tmp'

const PROJECT = {
  'package.json': JSON.stringify({
    name: 'test-app',
    version: '1.0.0',
    dependencies: { 'react-native': '0.72.0' },
  }),
  'src/ProfileCard.tsx': [
    "import React from 'react'",
    "import { View, StyleSheet } from 'react-native'",
    'const ProfileCard = () => <View />',
    'export default ProfileCard',
    '',
  ].join('\n'),
}

function fakeStore(patterns: Pattern[]): PatternStore {
  return {
    getActivePatterns: () => patterns.filter(p => p.confidence > 0.3),
    getPatternsByCategory: (category: string) => patterns.filter(p => p.category === category),
  }
}

describe('ContextEngine', () => {
  let dir: string

  beforeEach(() => {
    dir = createTempProject(PROJECT)
  })

  afterEach(() => {
    cleanup(dir)
  })

  it('getSnapshot is null before init', () => {
    const engine = new ContextEngine(dir)
    expect(engine.getSnapshot()).toBeNull()
  })

  it('init creates the .vectalon directory and persists files', () => {
    const engine = new ContextEngine(dir)
    const snapshot = engine.init()
    expect(existsSync(join(dir, '.vectalon', 'snapshot.json'))).toBe(true)
    expect(existsSync(join(dir, '.vectalon', 'context.md'))).toBe(true)
    expect(snapshot.project.name).toBe('test-app')
    expect(snapshot.timestamp).toBeGreaterThan(0)
  })

  it('refresh rebuilds the snapshot and returns it', () => {
    const engine = new ContextEngine(dir)
    engine.init()
    const before = engine.getSnapshot()?.timestamp
    const after = engine.refresh()
    expect(after.timestamp).toBeGreaterThanOrEqual(before as number)
    expect(engine.getSnapshot()).not.toBeNull()
  })

  it('buildContextPrompt includes project header and components', () => {
    const engine = new ContextEngine(dir)
    engine.init()
    const prompt = engine.buildContextPrompt()
    expect(prompt).toContain('# Project: test-app v1.0.0')
    expect(prompt).toContain('ProfileCard')
    expect(prompt).toContain('React Native: 0.72.0')
  })

  it('buildContextPrompt includes learned patterns when a store is attached', () => {
    const engine = new ContextEngine(dir)
    engine.init()
    engine.attachPatternStore(
      fakeStore([
        {
          id: 'naming-pascal',
          pattern: 'PascalCase components',
          description: 'Uses PascalCase',
          confidence: 0.9,
          occurrences: 3,
          firstSeen: 1,
          lastSeen: 2,
          category: 'naming',
        },
      ])
    )
    const prompt = engine.buildContextPrompt()
    expect(prompt).toContain('## Learned Patterns')
    expect(prompt).toContain('PascalCase components')
  })

  it('exposes the attached pattern store via getPatternStore', () => {
    const engine = new ContextEngine(dir)
    engine.init()
    const store = fakeStore([])
    engine.attachPatternStore(store)
    expect(engine.getPatternStore()).toBe(store)
  })

  it('persists the AST knowledge graph alongside the code graph', () => {
    const engine = new ContextEngine(dir)
    engine.init()
    expect(existsSync(join(dir, '.vectalon', 'knowledge-graph.json'))).toBe(true)
    const snapshot = engine.getSnapshot()
    expect(snapshot?.knowledgeGraph).toBeDefined()
    expect(snapshot?.knowledgeGraph?.components.map(c => c.name)).toContain('ProfileCard')
  })

  it('includes a monorepo workspace section when the app lives in a workspace', () => {
    const ws = createTempProject({
      'pnpm-workspace.yaml': 'packages:\n  - "packages/*"\n',
      'package.json': JSON.stringify({ name: 'root', version: '1.0.0', private: true }),
      'packages/mobile/package.json': JSON.stringify({
        name: 'mobile-app',
        version: '1.0.0',
        dependencies: { 'react-native': '0.76.0' },
      }),
      'packages/ui/package.json': JSON.stringify({ name: '@acme/ui', version: '1.0.0' }),
      'packages/mobile/src/ProfileCard.tsx': [
        "import React from 'react'",
        "import { View } from 'react-native'",
        'const ProfileCard = () => <View />',
        'export default ProfileCard',
        '',
      ].join('\n'),
    })
    try {
      const engine = new ContextEngine(join(ws, 'packages', 'mobile'))
      engine.init()
      const prompt = engine.buildContextPrompt()
      expect(prompt).toContain('## Workspace')
      expect(prompt).toContain('Monorepo: Yes (pnpm workspace)')
      expect(prompt).toContain('## Internal packages')
      expect(prompt).toContain('@acme/ui')
      expect(prompt).toContain('hoisted to the workspace root')
    } finally {
      cleanup(ws)
    }
  })

  it('includes navigation and native module sections when present', () => {
    const withNative = createTempProject({
      'package.json': JSON.stringify({ name: 'nav-app', version: '1.0.0', dependencies: { 'react-native': '0.72.0' } }),
      'src/App.tsx': [
        "import { NavigationContainer } from '@react-navigation/native'",
        "import { createNativeStackNavigator } from '@react-navigation/native-stack'",
        'const Stack = createNativeStackNavigator()',
        'export default function App() {',
        '  return (',
        '    <NavigationContainer>',
        '      <Stack.Navigator>',
        '        <Stack.Screen name="Home" component={HomeScreen} />',
        '      </Stack.Navigator>',
        '    </NavigationContainer>',
        '  )',
        '}',
      ].join('\n'),
      'src/native/Bridge.ts': ["import { NativeModules } from 'react-native'", 'export const t = NativeModules.SecureStore'].join('\n'),
    })
    const engine = new ContextEngine(withNative)
    engine.init()
    const prompt = engine.buildContextPrompt()
    expect(prompt).toContain('## Navigation')
    expect(prompt).toContain('Stack (native-stack)')
    expect(prompt).toContain('Home → HomeScreen')
    expect(prompt).toContain('## Native modules')
    expect(prompt).toContain('SecureStore')
    cleanup(withNative)
  })
})
