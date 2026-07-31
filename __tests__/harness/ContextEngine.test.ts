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
})
