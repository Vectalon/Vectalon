import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { Scanner } from './Scanner'
import { buildCodeGraph } from './CodeGraph'
import type { ContextSnapshot } from './types'
import type { PatternStore } from '../memory/PatternLearner'

export class ContextEngine {
  private scanner: Scanner
  private contextDir: string
  private snapshot: ContextSnapshot | null = null
  private patternStore: PatternStore | null = null

  constructor(root: string) {
    this.scanner = new Scanner(root)
    this.contextDir = join(root, '.vectalon')
  }

  init(): ContextSnapshot {
    if (!existsSync(this.contextDir)) {
      mkdirSync(this.contextDir, { recursive: true })
    }

    this.snapshot = this.buildSnapshot()
    this.persist()
    return this.snapshot
  }

  refresh(): ContextSnapshot {
    this.snapshot = this.buildSnapshot()
    this.persist()
    return this.snapshot
  }

  getSnapshot(): ContextSnapshot | null {
    return this.snapshot
  }

  getPatternStore(): PatternStore | null {
    return this.patternStore
  }

  attachPatternStore(store: PatternStore): void {
    this.patternStore = store
  }

  buildContextPrompt(): string {
    if (!this.snapshot) return ''

    const { project, components, structure } = this.snapshot

    const sections: string[] = [
      `# Project: ${project.name} v${project.version}`,
      `- React Native: ${project.reactNativeVersion}`,
      `- Platforms: ${project.platforms.join(', ')}`,
      `- TypeScript: ${project.hasTypeScript ? 'Yes' : 'No'}`,
      `- Metro: ${project.hasMetro ? 'Yes' : 'No'}`,
      `- Expo: ${project.hasExpo ? 'Yes' : 'No'}`,
    ]

    if (components.length > 0) {
      sections.push('', '## Components')
      const componentList = components
        .slice(0, 50)
        .map(c => `- ${c.name} (${c.filePath})${c.usesNavigation ? ' [navigation]' : ''}`)
      sections.push(...componentList)
    }

    if (this.patternStore) {
      const patterns = this.patternStore.getActivePatterns()
      if (patterns.length > 0) {
        sections.push('', '## Learned Patterns')
        sections.push(...patterns.slice(0, 20).map(p => `- ${p.pattern}: ${p.description}`))
      }
    }

    sections.push('', '## Structure')
    const topDirs = structure
      .filter(n => n.type === 'directory')
      .slice(0, 30)
      .map(n => `- ${n.path}/`)
    sections.push(...topDirs)

    return sections.join('\n')
  }

  private buildSnapshot(): ContextSnapshot {
    const project = this.scanner.scanProject()
    const structure = this.scanner.scanStructure()
    const components = this.scanner.scanComponents()
    const codeGraph = buildCodeGraph(project.root)

    return {
      project,
      structure,
      components,
      recentChanges: [],
      timestamp: Date.now(),
      codeGraph,
    }
  }

  private persist(): void {
    if (!this.snapshot) return
    writeFileSync(
      join(this.contextDir, 'snapshot.json'),
      JSON.stringify(this.snapshot, null, 2)
    )
    writeFileSync(
      join(this.contextDir, 'context.md'),
      this.buildContextPrompt()
    )
    if (this.snapshot.codeGraph) {
      writeFileSync(
        join(this.contextDir, 'code-graph.json'),
        JSON.stringify(this.snapshot.codeGraph, null, 2)
      )
    }
  }
}
