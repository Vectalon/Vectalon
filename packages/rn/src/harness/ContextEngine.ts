import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { Scanner } from './Scanner'
import { buildCodeGraph } from './CodeGraph'
import { buildKnowledgeGraph } from './KnowledgeGraph'
import { newArchitectureLabel } from '../utils/newArchitecture'
import { reactCompilerLabel } from '../utils/reactCompiler'
import type { ContextSnapshot } from './types'
import type { PatternStore } from '../memory/PatternLearner'
import {
  EngineeringProfile as ProfileClass,
  reactNativeEngineeringProfile,
  rnRules,
  rnGuardrails,
  rnTools,
} from '@vectalon-dev/core'
import type {
  EngineeringProfileInterface as IEngineeringProfile,
  ProjectProfile,
} from '@vectalon-dev/core'

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

  /**
   * Build a structured EngineeringProfile from the current project snapshot.
   *
   * Bridges the Scanner-derived ProjectInfo into Core's ProjectProfile,
   * then composes it onto the base React Native EngineeringProfile.
   *
   * This is the primary integration point between the RN product adapter
   * and Core's composable profile system.
   */
  buildEngineeringProfile(): IEngineeringProfile {
    if (!this.snapshot) {
      this.init()
    }
    const snapshot = this.snapshot!
    const projectProfile = snapshotProjectToProfile(snapshot)

    return ProfileClass.merge(reactNativeEngineeringProfile as unknown as IEngineeringProfile, {
      project: projectProfile,
      metadata: {
        ...reactNativeEngineeringProfile.metadata,
        updatedAt: new Date().toISOString(),
        description: `React Native profile for ${snapshot.project.name} v${snapshot.project.version}`,
      },
    })
  }

  /**
   * Persist the EngineeringProfile alongside the existing snapshot artifacts.
   */
  persistEngineeringProfile(): IEngineeringProfile {
    const profile = this.buildEngineeringProfile()
    if (!this.contextDir) return profile

    mkdirSync(this.contextDir, { recursive: true })
    writeFileSync(
      join(this.contextDir, 'engineering-profile.json'),
      ProfileClass.serialize(profile as any),
    )
    return profile
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
      // Map THIS app's declared dependencies to internal workspace members —
      // the shared libraries (e.g. a UI kit) it actually consumes. This is the
      // workspace-boundary signal: import them by name, Metro resolves them
      // through the workspace, and they must never be registry-installed here.
      const deps = { ...project.dependencies, ...project.devDependencies }
      const internalDeps = Object.keys(workspace.internalPackages).filter(name => deps[name])
      if (internalDeps.length > 0) {
        sections.push('', '## Workspace dependencies')
        sections.push('- This app depends on these internal workspace packages (shared UI/libs):')
        for (const name of internalDeps.slice(0, 20)) {
          sections.push(`- ${name} → ${workspace.internalPackages[name]}`)
        }
        sections.push('', '- Import them by name (`import { X } from "@acme/ui"`) — Metro resolves them through the workspace; never install them from a registry. Changes to a shared package rebuild this app via workspace resolution.')
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
    if (kg && (kg.navigators.length > 0 || kg.expoRoutes.length > 0)) {
      sections.push('', '## Navigation')
      if (kg.expoRoutes.length > 0) {
        sections.push('- **Expo Router (file-based)**')
        for (const r of kg.expoRoutes.filter(r => !r.isLayout).slice(0, 15)) {
          const dynamic = r.dynamicSegments.length > 0 ? ` [dynamic: ${r.dynamicSegments.join(', ')}]` : ''
          sections.push(`  - ${r.route}${dynamic} (${r.filePath})`)
        }
      }
      for (const nav of kg.navigators.slice(0, 10)) {
        const screens = nav.screens.map(s => `${s.name} → ${s.component}`).join(', ') || 'no screens declared'
        sections.push(`- ${nav.name} (${nav.type}) in ${nav.filePath}: ${screens}`)
      }
      const navHooks = new Set(kg.hooks.map(h => h.hook).filter(h => /^useNavigation|^useRoute|^useFocusEffect|^useIsFocused/.test(h)))
      if (navHooks.size > 0) {
        sections.push(`- Navigation hooks: ${[...navHooks].join(', ')}`)
      }
    }

    if (kg && kg.stores.length > 0) {
      sections.push('', '## State management')
      for (const store of kg.stores.slice(0, 10)) {
        const consumers = store.consumers.map(c => c.component).join(', ') || 'no direct consumers'
        sections.push(`- ${store.name} (${store.kind}) in ${store.filePath}: used by ${consumers}`)
      }
    }

    if (kg && kg.nativeModules.length > 0) {
      sections.push('', '## Native modules')
      for (const mod of kg.nativeModules.slice(0, 10)) {
        sections.push(`- ${mod.filePath}: ${mod.modules.join(', ')}`)
      }
    }

    if (kg && kg.reRenderImpact.length > 0) {
      sections.push('', '## Re-render impact')
      sections.push('- Shared components (≥2 parents) and the screens they re-render:')
      for (const imp of kg.reRenderImpact.slice(0, 10)) {
        const screens = imp.screens.map(s => {
          const c = kg.components.find(c => c.id === s)
          return c ? c.name : s
        }).join(', ') || 'none'
        sections.push(`- ${imp.name} (${imp.filePath}) ← ${imp.parents.length} parents; affects ${screens}`)
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
    // refresh() may run on a project that was never init'ed (e.g. the golden
    // replay harness) — make sure the .vectalon context dir exists before
    // writing the snapshot artifacts.
    mkdirSync(this.contextDir, { recursive: true })
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

// ─── Helpers ─────────────────────────────────────────────────────────────

/**
 * Convert a scanner-derived ContextSnapshot into Core's ProjectProfile.
 *
 * This is the bridge between the RN-specific Scanner output and the
 * language-neutral Core abstraction. The Core ProjectProfile is consumed
 * by CompositionEngine and downstream consumers.
 */
function snapshotProjectToProfile(snapshot: ContextSnapshot): ProjectProfile {
  const { project } = snapshot
  return {
    name: project.name,
    version: project.version,
    language: project.hasTypeScript ? 'typescript' : 'javascript',
    framework: 'react-native',
    platform: project.platforms.join(',') || undefined,
    dependencies: project.dependencies,
    devDependencies: project.devDependencies,
    features: [
      ...(project.hasTypeScript ? ['typescript'] : []),
      ...(project.hasMetro ? ['metro'] : []),
      ...(project.hasExpo ? ['expo'] : []),
      ...(project.newArchitecture?.enabled ? ['new-architecture'] : []),
      ...(project.reactCompiler?.enabled ? ['react-compiler'] : []),
    ],
    constraints: [],
  }
}
