import { readFileSync, existsSync, readdirSync, statSync } from 'fs'
import { join, relative, extname } from 'path'
import { analyzeSourceFile, type PlatformSuffix } from './AstScanner'

type NavigatorType =
  | 'native-stack'
  | 'stack'
  | 'bottom-tabs'
  | 'material-top-tabs'
  | 'drawer'
  | 'material-bottom-tabs'
  | 'unknown'

/**
 * RN Knowledge Graph — the project-wide picture built from AST analysis.
 *
 * Tracks component trees (parent → child through JSX usage), hook
 * dependencies, navigation structure (navigators + screens), and native
 * module boundaries, plus platform-specific file variants.
 */

export interface GraphComponent {
  /** Stable id: `${filePath}#${name}`. */
  id: string
  name: string
  filePath: string
  kind: 'function' | 'class'
  isDefaultExport: boolean
  isNamedExport: boolean
  hooks: string[]
  hocs: string[]
  children: string[]
  platform: PlatformSuffix
  usesStyleSheet: boolean
  usesNavigation: boolean
}

export interface GraphEdge {
  from: string
  to: string
}

export interface GraphHookUsage {
  hook: string
  filePath: string
  component: string | null
  deps: string[] | null
}

export interface GraphNavigator {
  filePath: string
  name: string
  type: NavigatorType
  screens: { name: string; component: string }[]
}

export interface GraphNativeModule {
  filePath: string
  modules: string[]
}

export interface RNGraph {
  components: GraphComponent[]
  edges: GraphEdge[]
  hooks: GraphHookUsage[]
  navigators: GraphNavigator[]
  nativeModules: GraphNativeModule[]
  /** Files that exist in both .ios./.android. variants (platform-split boundaries). */
  platformVariants: { base: string; variants: string[] }[]
}

const SOURCE_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx'])

function isSourceFile(name: string): boolean {
  return SOURCE_EXTS.has(extname(name))
}

function walkSourceFiles(dir: string, files: string[]): void {
  for (const entry of readdirSync(dir)) {
    if (entry.startsWith('.') || entry === 'node_modules') continue
    const fullPath = join(dir, entry)
    const stat = statSync(fullPath)
    if (stat.isDirectory()) {
      walkSourceFiles(fullPath, files)
    } else if (isSourceFile(entry)) {
      files.push(fullPath)
    }
  }
}

function baseName(filePath: string): string {
  return filePath.replace(/\.(ios|android|windows|macos|web|native)\.(tsx?|jsx?|ts|js)$/, '')
}

/** Build the RN knowledge graph for a project's `src` tree (relative to root). */
export function buildKnowledgeGraph(root: string, srcDir = 'src'): RNGraph {
  const srcPath = join(root, srcDir)
  const empty: RNGraph = { components: [], edges: [], hooks: [], navigators: [], nativeModules: [], platformVariants: [] }
  if (!existsSync(srcPath)) return empty

  const absoluteFiles: string[] = []
  walkSourceFiles(srcPath, absoluteFiles)

  const graph: RNGraph = { ...empty }
  const fileByBase = new Map<string, string[]>()
  const componentIndex = new Map<string, GraphComponent>()

  for (const fullPath of absoluteFiles) {
    let content: string
    try {
      content = readFileSync(fullPath, 'utf-8')
    } catch {
      continue
    }
    const filePath = relative(root, fullPath)
    const analysis = analyzeSourceFile(content, filePath)
    if (!analysis) continue

    // Platform variant tracking.
    const base = baseName(filePath)
    const variants = fileByBase.get(base) || []
    variants.push(filePath)
    fileByBase.set(base, variants)

    for (const comp of analysis.components) {
      const gc: GraphComponent = {
        id: `${filePath}#${comp.name}`,
        name: comp.name,
        filePath,
        kind: comp.kind,
        isDefaultExport: comp.isDefaultExport,
        isNamedExport: comp.isNamedExport,
        hooks: comp.hooks,
        hocs: comp.hocs,
        children: comp.children,
        platform: analysis.platform,
        usesStyleSheet: analysis.usesStyleSheet,
        usesNavigation: analysis.usesNavigation,
      }
      graph.components.push(gc)
      componentIndex.set(comp.name, gc)
    }

    for (const hook of analysis.hooks) {
      graph.hooks.push({ hook: hook.hook, filePath, component: hook.component, deps: hook.deps })
    }

    for (const nav of analysis.navigation.navigators) {
      graph.navigators.push({ filePath, name: nav.name, type: nav.type, screens: nav.screens })
    }

    if (analysis.nativeModules.length > 0) {
      graph.nativeModules.push({ filePath, modules: analysis.nativeModules })
    }
  }

  // Component tree edges: resolve JSX child references to component definitions.
  for (const comp of graph.components) {
    for (const childName of comp.children) {
      const target = componentIndex.get(childName)
      if (target && target.id !== comp.id) {
        graph.edges.push({ from: comp.id, to: target.id })
      }
    }
  }

  for (const [base, variants] of fileByBase) {
    if (variants.length > 1) {
      graph.platformVariants.push({ base, variants })
    }
  }

  return graph
}
