import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { Scanner } from './Scanner'
import { buildCodeGraph } from './CodeGraph'
import { buildKnowledgeGraph } from './KnowledgeGraph'
import { newArchitectureLabel } from '../utils/newArchitecture'
import { reactCompilerLabel } from '../utils/reactCompiler'
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
      `- React: ${project.reactVersion || 'unknown'}`,
      `- Platforms: ${project.platforms.join(', ')}`,
      `- TypeScript: ${project.hasTypeScript ? 'Yes' : 'No'}`,
      `- Metro: ${project.hasMetro ? 'Yes' : 'No'}`,
      `- Tooling: ${project.tooling === 'expo' ? `Expo (SDK ${project.expoSdkVersion || 'unknown'})` : 'React Native CLI (bare)'}`,
      `- New Architecture: ${newArchitectureLabel(project.newArchitecture)}`,
    ]

    const compiler = project.reactCompiler
    const react19 = /^(>=|~|\^)?19/.test(project.reactVersion)
    if (compiler || react19) {
      sections.push('', '## React 19 / Compiler')
      if (compiler?.enabled) {
        sections.push(`- React Compiler: ${reactCompilerLabel(compiler)} (${compiler.sources.join(', ') || 'babel-plugin-react-compiler'})`)
        sections.push('- The Compiler auto-memoizes components — manual `useMemo`/`useCallback` are usually redundant; keep props and state immutable so the Compiler can cache safely')
      } else if (react19) {
        sections.push(`- React: ${project.reactVersion || '19'}`)
        sections.push('- React 19: prefer `ref` as a prop over `forwardRef`; `use()` reads promises/context (must be inside a `<Suspense>` boundary for promises); effects must return cleanup for subscriptions')
      }
    }

    const workspace = project.workspace
    if (workspace?.isMonorepo) {
      sections.push('', '## Workspace')
      sections.push(`- Monorepo: Yes (${workspace.manager || 'unknown'} workspace)`)
      sections.push(`- Workspace root: ${workspace.root || 'unknown'}`)
      sections.push(`- Hoisted node_modules: ${workspace.hoistedNodeModules ? 'Yes — packages resolve from the workspace root, not this package' : 'No'}`)
      const internal = Object.entries(workspace.internalPackages)
        .slice(0, 20)
        .map(([name, dir]) => `- ${name} (${dir})`)
      if (internal.length > 0) {
        sections.push('', '## Internal packages')
        sections.push(...internal)
      }
      if (workspace.hoistedNodeModules) {
        sections.push('', '> ⚠️ This app is in a monorepo workspace — `react-native` and other native deps are hoisted to the workspace root. Do not add them to this package\'s `dependencies`/`devDependencies`; install from the workspace root instead.')
      }
    }

    if (components.length > 0) {
      sections.push('', '## Components')
      const componentList = components
        .slice(0, 50)
        .map(c => `- ${c.name} (${c.filePath})${c.usesNavigation ? ' [navigation]' : ''}${c.hooks && c.hooks.length > 0 ? ` [hooks: ${c.hooks.join(', ')}]` : ''}`)
      sections.push(...componentList)
    }

    const kg = this.snapshot.knowledgeGraph
    if (kg && kg.navigators.length > 0) {
      sections.push('', '## Navigation')
      for (const nav of kg.navigators.slice(0, 10)) {
        const screens = nav.screens.map(s => `${s.name} → ${s.component}`).join(', ') || 'no screens declared'
        sections.push(`- ${nav.name} (${nav.type}) in ${nav.filePath}: ${screens}`)
      }
      const navHooks = new Set(kg.hooks.map(h => h.hook).filter(h => /^useNavigation|^useRoute|^useFocusEffect|^useIsFocused/.test(h)))
      if (navHooks.size > 0) {
        sections.push(`- Navigation hooks: ${[...navHooks].join(', ')}`)
      }
    }

    if (kg && kg.nativeModules.length > 0) {
      sections.push('', '## Native modules')
      for (const mod of kg.nativeModules.slice(0, 10)) {
        sections.push(`- ${mod.filePath}: ${mod.modules.join(', ')}`)
      }
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
    const knowledgeGraph = buildKnowledgeGraph(project.root)

    return {
      project,
      structure,
      components,
      recentChanges: [],
      timestamp: Date.now(),
      codeGraph,
      knowledgeGraph,
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
    if (this.snapshot.knowledgeGraph) {
      writeFileSync(
        join(this.contextDir, 'knowledge-graph.json'),
        JSON.stringify(this.snapshot.knowledgeGraph, null, 2)
      )
    }
  }
}
