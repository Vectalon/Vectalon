import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import type { Pattern, PatternStore } from './PatternLearner'

interface MemoryStore {
  version: number
  projectName: string
  patterns: Pattern[]
  sessionHistory: SessionRecord[]
  decisions: DecisionRecord[]
}

interface SessionRecord {
  id: string
  timestamp: number
  agentType: string
  actions: number
}

interface DecisionRecord {
  id: string
  timestamp: number
  action: string
  context: string
  outcome?: string
}

export class ProjectMemory implements PatternStore {
  private memoryPath: string
  private store: MemoryStore

  constructor(projectRoot: string) {
    const cortexDir = join(projectRoot, '.cortex')
    if (!existsSync(cortexDir)) {
      mkdirSync(cortexDir, { recursive: true })
    }
    this.memoryPath = join(cortexDir, 'memory.json')
    this.store = this.load()
  }

  getActivePatterns(): Pattern[] {
    return this.store.patterns.filter(p => p.confidence > 0.3)
  }

  getPatternsByCategory(category: string): Pattern[] {
    return this.store.patterns.filter(p => p.category === category)
  }

  addPattern(pattern: Pattern): void {
    const existing = this.store.patterns.find(p => p.id === pattern.id)
    if (existing) {
      existing.occurrences++
      existing.lastSeen = Date.now()
      existing.confidence = Math.min(existing.confidence + 0.15, 1.0)
    } else {
      this.store.patterns.push(pattern)
    }
    this.save()
  }

  recordDecision(action: string, context: string, outcome?: string): void {
    this.store.decisions.push({
      id: `dec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
      action,
      context,
      outcome,
    })
    this.save()
  }

  private load(): MemoryStore {
    try {
      if (existsSync(this.memoryPath)) {
        return JSON.parse(readFileSync(this.memoryPath, 'utf-8'))
      }
    } catch {
      // Corrupted memory file — start fresh
    }

    return {
      version: 1,
      projectName: '',
      patterns: [],
      sessionHistory: [],
      decisions: [],
    }
  }

  private save(): void {
    writeFileSync(this.memoryPath, JSON.stringify(this.store, null, 2))
  }
}
