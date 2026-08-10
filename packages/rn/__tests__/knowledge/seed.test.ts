import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { seedKnowledgeBaseFromScan, maintainKnowledgeBase, ArtifactStore } from '../../src/knowledge'
import { ContextEngine } from '../../src/harness/ContextEngine'
import { ProjectMemory } from '../../src/memory/ProjectMemory'
import { PatternLearner } from '../../src/memory/PatternLearner'
import { createTempProject, cleanup } from '../helpers/tmp'

const PROJECT: Record<string, string> = {
  'package.json': JSON.stringify({
    name: 'app',
    version: '1.0.0',
    dependencies: { react: '18.2.0', 'react-native': '0.72.5' },
  }),
  'src/Home.tsx': [
    "import React from 'react'",
    "import { View, Text, StyleSheet } from 'react-native'",
    'const Home = () => <View style={styles.root}><Text>Home</Text></View>',
    'const styles = StyleSheet.create({ root: { flex: 1 } })',
    'export default Home',
    '',
  ].join('\n'),
  'android/gradle.properties': 'newArchEnabled=false\nhermesEnabled=true\n',
  'android/build.gradle': 'ext { kotlinVersion = "1.8.10" }\n',
  'ios/Podfile': "platform :ios, '13.0'\n",
}

const SEED_TITLES = ['Project Snapshot', 'Knowledge Graph', 'Code Graph', 'Native Configuration', 'Learned Patterns']

describe('knowledge seeding from repo scan', () => {
  let dir: string

  beforeEach(() => {
    dir = createTempProject(PROJECT)
  })

  afterEach(() => {
    cleanup(dir)
  })

  it('seeds the repo-derived artifacts into the knowledge base', () => {
    const result = seedKnowledgeBaseFromScan(dir)
    expect(result.created).toBe(5)
    expect(result.total).toBe(5)

    const store = new ArtifactStore(dir)
    const titles = store.list().map(a => a.title)
    expect(titles).toEqual(expect.arrayContaining(SEED_TITLES))

    const snapshot = store.list().find(a => a.title === 'Project Snapshot')
    expect(snapshot?.content).toContain('react-native')
    expect(snapshot?.content).toContain('0.72.5')
    expect(snapshot?.source).toBe('generated')

    const graph = store.list().find(a => a.title === 'Knowledge Graph')
    expect(graph?.content).toContain('# Knowledge Graph')

    const native = store.list().find(a => a.title === 'Native Configuration')
    expect(native?.content).toContain('Hermes')
  })

  it('is idempotent — re-seeding updates instead of duplicating', () => {
    const first = seedKnowledgeBaseFromScan(dir)
    expect(first.created).toBe(5)

    const second = seedKnowledgeBaseFromScan(dir)
    expect(second.created).toBe(0)
    expect(second.updated).toBe(0)

    const store = new ArtifactStore(dir)
    expect(store.list().filter(a => a.title === 'Project Snapshot')).toHaveLength(1)
    expect(store.list()).toHaveLength(5)
  })

  it('never overwrites a user artifact with a colliding title', () => {
    const store = new ArtifactStore(dir)
    const user = store.add({
      type: 'engineering',
      title: 'Project Snapshot',
      content: 'user-authored content that must survive',
      source: 'user',
    })

    const result = seedKnowledgeBaseFromScan(dir)
    // The seed creates its own artifact; the user's artifact is untouched.
    expect(store.get(user.id)?.content).toBe('user-authored content that must survive')
    const seeded = store.list().filter(a => a.meta['vectalon-seed'] === '1' && a.title === 'Project Snapshot')
    expect(seeded).toHaveLength(1)
    expect(seeded[0].content).toContain('react-native')
    expect(result.created).toBe(5)
  })

  it('maintainKnowledgeBase re-scans and refreshes artifacts after code changes', () => {
    seedKnowledgeBaseFromScan(dir)

    // Bump the app version — the Project Snapshot artifact must refresh.
    const pkgPath = join(dir, 'package.json')
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as { version: string }
    writeFileSync(pkgPath, JSON.stringify({ ...pkg, version: '2.0.0' }))

    const result = maintainKnowledgeBase(dir)
    expect(result.total).toBe(5)
    expect(result.created).toBe(0)
    expect(result.updated).toBeGreaterThanOrEqual(1)

    const store = new ArtifactStore(dir)
    const snapshot = store.list().find(a => a.title === 'Project Snapshot')
    expect(snapshot?.content).toContain('v2.0.0')
  })

  it('accepts an existing engine and pattern store (init reuse)', () => {
    // Reuse path mirrors how init calls the seed with its already-built engine.
    const engine = new ContextEngine(dir)
    engine.init()
    const memory = new ProjectMemory(dir)
    const snapshot = engine.getSnapshot()
    if (snapshot) new PatternLearner(memory).learnFromComponents(snapshot.components)

    const result = seedKnowledgeBaseFromScan(dir, { engine, patternStore: memory })
    expect(result.created).toBe(5)
  })
})
