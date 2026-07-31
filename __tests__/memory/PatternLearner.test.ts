import { PatternLearner } from '../../src/memory/PatternLearner'
import type { PatternStore } from '../../src/memory/PatternLearner'

function fakeStore(): PatternStore & { addPattern: jest.Mock } {
  return {
    getActivePatterns: () => [],
    getPatternsByCategory: () => [],
    addPattern: jest.fn(),
  }
}

describe('PatternLearner', () => {
  it('detects a PascalCase naming convention', () => {
    const learner = new PatternLearner(fakeStore())
    learner.learnFromComponents([
      { name: 'ProfileCard', usesStyleSheet: false, usesNavigation: false },
      { name: 'HomeScreen', usesStyleSheet: false, usesNavigation: false },
      { name: 'settings', usesStyleSheet: false, usesNavigation: false },
    ])

    const pascal = learner.getPatternsByCategory('naming')
    expect(pascal.map(p => p.id)).toContain('naming-pascal')
  })

  it('does not infer a naming convention from a 50/50 mix', () => {
    const learner = new PatternLearner(fakeStore())
    learner.learnFromComponents([
      { name: 'profileCard', usesStyleSheet: false, usesNavigation: false },
      { name: 'HomeScreen', usesStyleSheet: false, usesNavigation: false },
    ])

    const naming = learner.getPatternsByCategory('naming')
    expect(naming).toEqual([])
  })

  it('detects StyleSheet styling patterns', () => {
    const learner = new PatternLearner(fakeStore())
    learner.learnFromComponents([
      { name: 'Card', usesStyleSheet: true, usesNavigation: false },
    ])
    expect(learner.getPatternsByCategory('styling').map(p => p.id)).toContain('styling-stylesheet')
  })

  it('detects navigation routing patterns', () => {
    const learner = new PatternLearner(fakeStore())
    learner.learnFromComponents([
      { name: 'HomeScreen', usesStyleSheet: false, usesNavigation: true },
    ])
    expect(learner.getPatternsByCategory('routing').map(p => p.id)).toContain('routing-navigation')
  })

  it('increments occurrences and confidence when a pattern is seen again', () => {
    const learner = new PatternLearner(fakeStore())
    const component = { name: 'ProfileCard', usesStyleSheet: false, usesNavigation: false }

    learner.learnFromComponents([component])
    learner.learnFromComponents([component])

    const pascal = learner.getPatternsByCategory('naming').find(p => p.id === 'naming-pascal')
    expect(pascal?.occurrences).toBe(2)
    expect(pascal?.confidence).toBeGreaterThan(0.5)
  })

  it('persists every detected pattern to the store', () => {
    const store = fakeStore()
    const learner = new PatternLearner(store)
    learner.learnFromComponents([
      { name: 'ProfileCard', usesStyleSheet: true, usesNavigation: true },
    ])

    const ids = store.addPattern.mock.calls.map(call => (call[0] as { id: string }).id)
    expect(ids).toContain('naming-pascal')
    expect(ids).toContain('styling-stylesheet')
    expect(ids).toContain('routing-navigation')
  })

  it('returns active patterns sorted by confidence descending', () => {
    const learner = new PatternLearner(fakeStore())
    learner.learnFromComponents([
      { name: 'ProfileCard', usesStyleSheet: true, usesNavigation: true },
    ])

    const active = learner.getActivePatterns()
    expect(active.length).toBeGreaterThan(1)
    for (let i = 1; i < active.length; i++) {
      expect(active[i - 1].confidence).toBeGreaterThanOrEqual(active[i].confidence)
    }
  })
})
