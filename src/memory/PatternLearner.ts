export interface Pattern {
  id: string
  pattern: string
  description: string
  confidence: number
  occurrences: number
  firstSeen: number
  lastSeen: number
  category: 'naming' | 'architecture' | 'styling' | 'routing' | 'state' | 'testing'
}

export interface PatternStore {
  getActivePatterns(): Pattern[]
  getPatternsByCategory(category: string): Pattern[]
}

export class PatternLearner {
  private patterns: Pattern[] = []
  private store: PatternStore

  constructor(store: PatternStore) {
    this.store = store
  }

  learnFromComponents(components: { name: string; usesStyleSheet: boolean; usesNavigation: boolean }[]): void {
    const namingPatterns = this.analyzeNamingConventions(components)
    for (const pattern of namingPatterns) {
      this.recordOrUpdate(pattern)
    }

    const hasStyleSheet = components.some(c => c.usesStyleSheet)
    if (hasStyleSheet) {
      this.recordOrUpdate({
        id: 'styling-stylesheet',
        pattern: 'StyleSheet.create',
        description: 'Uses StyleSheet.create for component styling',
        confidence: 0.7,
        occurrences: 0,
        firstSeen: 0,
        lastSeen: Date.now(),
        category: 'styling',
      })
    }

    const hasNavigation = components.some(c => c.usesNavigation)
    if (hasNavigation) {
      this.recordOrUpdate({
        id: 'routing-navigation',
        pattern: 'React Navigation',
        description: 'Uses React Navigation for screen routing',
        confidence: 0.8,
        occurrences: 0,
        firstSeen: 0,
        lastSeen: Date.now(),
        category: 'routing',
      })
    }
  }

  getActivePatterns(): Pattern[] {
    return this.patterns.filter(p => p.confidence > 0.3).sort((a, b) => b.confidence - a.confidence)
  }

  getPatternsByCategory(category: string): Pattern[] {
    return this.patterns.filter(p => p.category === category)
  }

  private analyzeNamingConventions(components: { name: string }[]): Pattern[] {
    const patterns: Pattern[] = []
    const pascalCaseCount = components.filter(c => /^[A-Z][a-zA-Z0-9]*$/.test(c.name)).length
    const camelCaseCount = components.filter(c => /^[a-z][a-zA-Z0-9]*$/.test(c.name)).length
    const kebabCount = components.filter(c => c.name.includes('-')).length
    const total = components.length

    if (total > 0) {
      if (pascalCaseCount / total > 0.5) {
        patterns.push({
          id: 'naming-pascal',
          pattern: 'PascalCase components',
          description: 'Component files use PascalCase naming convention',
          confidence: pascalCaseCount / total,
          occurrences: pascalCaseCount,
          firstSeen: 0,
          lastSeen: Date.now(),
          category: 'naming',
        })
      }
      if (camelCaseCount / total > 0.5) {
        patterns.push({
          id: 'naming-camel',
          pattern: 'camelCase components',
          description: 'Component files use camelCase naming convention',
          confidence: camelCaseCount / total,
          occurrences: camelCaseCount,
          firstSeen: 0,
          lastSeen: Date.now(),
          category: 'naming',
        })
      }
    }

    return patterns
  }

  private recordOrUpdate(pattern: Pattern): void {
    const existing = this.patterns.find(p => p.id === pattern.id)
    if (existing) {
      existing.occurrences++
      existing.lastSeen = Date.now()
      existing.confidence = Math.min(existing.confidence + 0.1, 1.0)
    } else {
      pattern.occurrences = 1
      pattern.firstSeen = Date.now()
      pattern.lastSeen = Date.now()
      this.patterns.push(pattern)
    }
  }
}
