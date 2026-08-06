import { readFileSync, existsSync, readdirSync, statSync } from 'fs'
import { join, relative, extname } from 'path'
import { analyzeSourceFile, type PlatformSuffix, type StoreKind } from './AstScanner'
import { reportError } from '../utils/safe'

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
  /** True when this component's body renders a `<X.Navigator>` (a navigation container). */
  isNavigatorContainer: boolean
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
  /** Identifiers referenced inside the hook callback body (missing-deps analysis). */
  bodyRefs: string[] | null
  /** Deps entries recreated every render (inline literals, calls, functions). */
  unstableDeps: string[] | null
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

export interface GraphStore {
  /** Local binding, e.g. `useAuthStore` / `countAtom` / `ThemeContext`. */
  name: string
  kind: StoreKind
  filePath: string
  /** Component names (with file paths) that consume this store. */
  consumers: { component: string; filePath: string }[]
}

export interface GraphExpoRoute {
  /** Route path, e.g. `/`, `/profile/[id]`, `/(tabs)/home`. */
  route: string
  filePath: string
  /** Dynamic segments, e.g. ['id'] for /profile/[id]. */
  dynamicSegments: string[]
  /** Route-group segments, e.g. ['tabs'] for app/(tabs)/home.tsx. */
  groups: string[]
  isLayout: boolean
  /** Default-export component in the route file, when present. */
  component: string | null
}

export interface ReRenderImpact {
  /** Shared component id (`file#name`) rendered by ≥2 parents. */
  componentId: string
  name: string
  filePath: string
  /** Direct parent component ids. */
  parents: string[]
  /** Screen ids whose subtree renders this component (re-render blast radius). */
  screens: string[]
}

export interface RNGraph {
  components: GraphComponent[]
  edges: GraphEdge[]
  hooks: GraphHookUsage[]
  navigators: GraphNavigator[]
  nativeModules: GraphNativeModule[]
  /** State-management boundaries: zustand/jotai/context stores + consumers. */
  stores: GraphStore[]
  /** Expo Router v4 file-based routes (from the `app/` dir). */
  expoRoutes: GraphExpoRoute[]
  /** Shared components and the screens they re-render. */
  reRenderImpact: ReRenderImpact[]
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
  const empty: RNGraph = {
    components: [],
    edges: [],
    hooks: [],
    navigators: [],
    nativeModules: [],
    stores: [],
    expoRoutes: [],
    reRenderImpact: [],
    platformVariants: [],
  }
  if (!existsSync(srcPath)) return empty

  const absoluteFiles: string[] = []
  walkSourceFiles(srcPath, absoluteFiles)

  const graph: RNGraph = { ...empty }
  const fileByBase = new Map<string, string[]>()
  const componentIndex = new Map<string, GraphComponent>()
  const storeConsumers = new Map<string, { component: string; filePath: string }[]>()

  for (const fullPath of absoluteFiles) {
    let content: string
    try {
      content = readFileSync(fullPath, 'utf-8')
    } catch (err) {
      reportError(err, 'KnowledgeGraph: reading source file')
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
        isNavigatorContainer: comp.isNavigatorContainer,
      }
      graph.components.push(gc)
      componentIndex.set(comp.name, gc)
    }

    for (const hook of analysis.hooks) {
      graph.hooks.push({
        hook: hook.hook,
        filePath,
        component: hook.component,
        deps: hook.deps,
        bodyRefs: hook.bodyRefs,
        unstableDeps: hook.unstableDeps,
      })
    }

    for (const nav of analysis.navigation.navigators) {
      graph.navigators.push({ filePath, name: nav.name, type: nav.type, screens: nav.screens })
    }

    if (analysis.nativeModules.length > 0) {
      graph.nativeModules.push({ filePath, modules: analysis.nativeModules })
    }

    // State-store boundaries: definitions + per-component consumption.
    for (const store of analysis.stores) {
      graph.stores.push({ name: store.name, kind: store.kind, filePath, consumers: [] })
    }
    for (const usage of analysis.storeUsages) {
      if (!usage.component) continue
      const list = storeConsumers.get(usage.store) || []
      list.push({ component: usage.component, filePath })
      storeConsumers.set(usage.store, list)
    }
  }

  for (const store of graph.stores) {
    store.consumers = storeConsumers.get(store.name) || []
  }

  // Expo Router v4 file-based routes from the app/ directory (default root).
  graph.expoRoutes = extractExpoRoutes(root)

  // Component tree edges: resolve JSX child references to component definitions.
  for (const comp of graph.components) {
    for (const childName of comp.children) {
      const target = componentIndex.get(childName)
      if (target && target.id !== comp.id) {
        graph.edges.push({ from: comp.id, to: target.id })
      }
    }
  }

  // Re-render impact: shared components (≥2 parents) and the screens that
  // transitively render them.
  graph.reRenderImpact = computeReRenderImpact(graph)

  for (const [base, variants] of fileByBase) {
    if (variants.length > 1) {
      graph.platformVariants.push({ base, variants })
    }
  }

  return graph
}

/**
 * Extract Expo Router v4 file-based routes. The default route root is the
 * project `app/` directory; `app/index.tsx` → `/`, `app/(tabs)/home.tsx` →
 * `/(tabs)/home`, `app/user/[id].tsx` → `/user/[id]` with dynamic segment
 * `id`. Files named `_layout` are layout files (not navigable routes).
 */
export function extractExpoRoutes(root: string): GraphExpoRoute[] {
  const appDir = join(root, 'app')
  if (!existsSync(appDir)) return []

  const routes: GraphExpoRoute[] = []
  const files: string[] = []
  walkSourceFiles(appDir, files)

  for (const fullPath of files) {
    if (!/\.[jt]sx$/.test(fullPath)) continue
    const rel = relative(appDir, fullPath).replace(/\.[jt]sx$/, '')
    const segments = rel.split('/')
    const dynamicSegments: string[] = []
    const groups: string[] = []
    let isLayout = false
    const pathSegments: string[] = []

    for (const seg of segments) {
      if (seg.startsWith('(') && seg.endsWith(')')) {
        groups.push(seg.slice(1, -1))
        pathSegments.push(seg)
      } else if (seg.startsWith('[') && seg.endsWith(']')) {
        const name = seg.slice(1, -1)
        // Optional dynamic [x] vs regular [x] — both are dynamic.
        dynamicSegments.push(name.replace(/^\?/, ''))
        pathSegments.push(`[${name.replace(/^\?/, '')}]`)
      } else if (seg === '_layout') {
        isLayout = true
        pathSegments.push(seg)
      } else if (seg === 'index') {
        pathSegments.push(seg)
      } else {
        pathSegments.push(seg)
      }
    }

    // Collapse a trailing `index` into its parent path (/profile/index -> /profile).
    let routeSegments = pathSegments
    if (routeSegments[routeSegments.length - 1] === 'index') {
      routeSegments = routeSegments.slice(0, -1)
    }
    const route = '/' + routeSegments.join('/')

    const filePath = relative(root, fullPath)
    let component: string | null = null
    try {
      const analysis = analyzeSourceFile(readFileSync(fullPath, 'utf-8'), filePath)
      const def = analysis?.components.find(c => c.isDefaultExport)
      component = def ? def.name : null
    } catch (err) {
      reportError(err, 'KnowledgeGraph: reading expo route file')
    }

    routes.push({ route, filePath, dynamicSegments, groups, isLayout, component })
  }

  // Deterministic ordering: / first, then alphabetical.
  return routes.sort((a, b) => (a.route === '/' ? -1 : b.route === '/' ? 1 : a.route < b.route ? -1 : 1))
}

/**
 * Re-render impact: a component rendered by ≥2 parents re-renders whenever any
 * parent re-renders. Compute, for each such shared component, the screen ids
 * whose subtree reaches it — the blast radius of an upstream re-render.
 * Screens are navigator-declared components + expo route default components.
 */
export function computeReRenderImpact(graph: RNGraph): ReRenderImpact[] {
  const parentsOf = new Map<string, string[]>()
  for (const edge of graph.edges) {
    const list = parentsOf.get(edge.to) || []
    list.push(edge.from)
    parentsOf.set(edge.to, list)
  }

  // Identify screens: navigator screen components + expo route components.
  const screenIds = new Set<string>()
  for (const nav of graph.navigators) {
    for (const s of nav.screens) {
      const id = graph.components.find(c => c.name === s.component)?.id
      if (id) screenIds.add(id)
    }
  }
  for (const route of graph.expoRoutes) {
    if (route.component) {
      const id = graph.components.find(c => c.name === route.component)?.id
      if (id) screenIds.add(id)
    }
  }

  // Children of a component (edges from -> to).
  const childrenOf = new Map<string, string[]>()
  for (const edge of graph.edges) {
    const list = childrenOf.get(edge.from) || []
    list.push(edge.to)
    childrenOf.set(edge.from, list)
  }

  // Which screens reach each component (transitive descendant walk).
  const reachingScreens = new Map<string, Set<string>>()
  function collect(screenId: string, compId: string, visited: Set<string>): void {
    if (visited.has(compId)) return
    visited.add(compId)
    const set = reachingScreens.get(compId) || new Set<string>()
    set.add(screenId)
    reachingScreens.set(compId, set)
    for (const child of childrenOf.get(compId) || []) {
      collect(screenId, child, visited)
    }
  }
  for (const screenId of screenIds) {
    collect(screenId, screenId, new Set<string>())
  }

  const impact: ReRenderImpact[] = []
  for (const comp of graph.components) {
    const parents = parentsOf.get(comp.id) || []
    if (parents.length < 2) continue
    impact.push({
      componentId: comp.id,
      name: comp.name,
      filePath: comp.filePath,
      parents,
      screens: [...(reachingScreens.get(comp.id) || [])],
    })
  }
  return impact.sort((a, b) => b.parents.length - a.parents.length || b.screens.length - a.screens.length)
}
