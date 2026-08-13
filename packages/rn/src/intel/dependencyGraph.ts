/**
 * Dependency Graph Engine (Roadmap 003) — file → file import graph over the
 * project's source, external package boundaries, and strongly-connected
 * component cycle detection. Deterministic, no model calls. The graph is
 * exported as JSON by the `vectalon intel --graph deps` command.
 * Business Source License 1.1 (BSL-1.1)
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'fs'
import { join, relative, dirname, extname } from 'path'
import { analyzeSourceFile } from '../harness'
import { reportError } from '../utils/safe'

export interface DepEdge {
  from: string
  to: string
}

export interface ExternalDependency {
  /** Importing source file (relative to root). */
  file: string
  /** Package name (scope kept for @scope/name). */
  package: string
}

export interface DepCycle {
  /** Files in the strongly-connected component (>=2 files, or a self-loop). */
  nodes: string[]
  /** One example edge loop, human-readable `a -> b -> c -> a`. */
  example: string
}

export interface DependencyGraph {
  /** Internal source files that participate in the graph. */
  nodes: string[]
  /** Internal file → file edges (relative paths). */
  internalEdges: DepEdge[]
  /** Imports that resolve to packages (node_modules / workspace members). */
  external: ExternalDependency[]
  /** Import specifiers that could not be resolved to a file or a package. */
  unresolved: { file: string; specifier: string }[]
  /** Strongly-connected components — circular import groups. */
  cycles: DepCycle[]
}

const SOURCE_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx'])
const RESOLVE_EXTS = ['.ts', '.tsx', '.js', '.jsx', '.ios.ts', '.ios.tsx', '.ios.js', '.ios.jsx', '.android.ts', '.android.tsx', '.android.js', '.android.jsx', '.native.ts', '.native.tsx', '.native.js', '.native.jsx']
/** app/ (Expo Router) participates alongside src/. */
const SOURCE_DIRS = ['src', 'app']

export function isSourceFile(name: string): boolean {
  return SOURCE_EXTS.has(extname(name))
}

function walkFiles(dir: string, out: string[]): void {
  for (const entry of readdirSync(dir)) {
    if (entry.startsWith('.') || entry === 'node_modules') continue
    const fullPath = join(dir, entry)
    const stat = statSync(fullPath)
    if (stat.isDirectory()) walkFiles(fullPath, out)
    else if (isSourceFile(entry)) out.push(fullPath)
  }
}

/** Collect every source file under root/src + root/app, plus root-level entries. */
export function collectSourceFiles(root: string): string[] {
  const files: string[] = []
  for (const dir of SOURCE_DIRS) {
    const abs = join(root, dir)
    if (!existsSync(abs)) continue
    const found: string[] = []
    walkFiles(abs, found)
    for (const f of found) files.push(relative(root, f))
  }
  // Root-level app entries (bare RN CLI layout: App.tsx at the project root).
  for (const entry of ['App.tsx', 'App.jsx', 'App.ts', 'App.js', 'index.ts', 'index.tsx', 'index.js']) {
    if (existsSync(join(root, entry))) files.push(entry)
  }
  return files.sort()
}

/** Resolve a relative specifier from an importer file to a source file. */
function resolveRelative(root: string, importer: string, specifier: string): string | null {
  const importerDir = dirname(join(root, importer))
  const base = join(importerDir, specifier)
  // Exact file match first.
  const exact = relative(root, base)
  if (isSourceFile(exact) && existsSync(join(root, exact))) return exact
  // Extension / platform-variant candidates.
  for (const ext of RESOLVE_EXTS) {
    const candidate = `${base}${ext}`
    const rel = relative(root, candidate)
    if (!rel.startsWith('..') && existsSync(candidate)) return rel
  }
  // Directory index files.
  for (const ext of RESOLVE_EXTS) {
    const candidate = join(base, `index${ext}`)
    const rel = relative(root, candidate)
    if (!rel.startsWith('..') && existsSync(candidate)) return rel
  }
  return null
}

/** Extract the package name from a bare specifier (@scope/name/rest → @scope/name). */
export function packageFromSpecifier(specifier: string): string {
  if (specifier.startsWith('@')) {
    const parts = specifier.split('/')
    return parts.length > 1 ? `${parts[0]}/${parts[1]}` : specifier
  }
  return specifier.split('/')[0]
}

/**
 * Build the dependency graph for a project. Every source file is parsed with
 * the shared AST layer; relative imports resolve to internal files, bare
 * specifiers become external package edges, and internal cycles are found via
 * Tarjan strongly-connected components.
 */
export function buildDependencyGraph(root: string, files: string[] = collectSourceFiles(root)): DependencyGraph {
  const graph: DependencyGraph = { nodes: [], internalEdges: [], external: [], unresolved: [], cycles: [] }
  graph.nodes = files

  const resolved = new Map<string, string | null>()
  for (const file of files) {
    let content: string
    try {
      content = readFileSync(join(root, file), 'utf-8')
    } catch (err) {
      reportError(err, `intel:deps: reading ${file}`)
      continue
    }
    const analysis = analyzeSourceFile(content, file)
    if (!analysis) continue
    for (const imp of analysis.imports) {
      const spec = imp.source
      if (spec.startsWith('.') || spec.startsWith('/')) {
        let target: string | null | undefined = resolved.get(spec)
        if (target === undefined) {
          target = resolveRelative(root, file, spec)
          resolved.set(spec, target)
        }
        if (target) {
          graph.internalEdges.push({ from: file, to: target })
        } else {
          graph.unresolved.push({ file, specifier: spec })
        }
      } else {
        graph.external.push({ file, package: packageFromSpecifier(spec) })
      }
    }
  }

  graph.cycles = findCycles(graph.internalEdges, new Set(graph.nodes))
  return graph
}

/**
 * Tarjan strongly-connected components: any SCC with >1 node (or a self-loop)
 * is a circular dependency group. `example` is one concrete `a -> b -> c -> a`
 * loop found by walking edges inside the component.
 */
export function findCycles(edges: DepEdge[], allNodes: Set<string>): DepCycle[] {
  const adj = new Map<string, string[]>()
  for (const e of edges) {
    const list = adj.get(e.from) || []
    list.push(e.to)
    adj.set(e.from, list)
  }
  const cycles: DepCycle[] = []
  const index = new Map<string, number>()
  const low = new Map<string, number>()
  const onStack = new Set<string>()
  const stack: string[] = []
  let counter = 0

  const strongConnect = (node: string): void => {
    index.set(node, counter)
    low.set(node, counter)
    counter++
    stack.push(node)
    onStack.add(node)
    for (const next of adj.get(node) || []) {
      if (!allNodes.has(next)) continue
      if (!index.has(next)) {
        strongConnect(next)
        low.set(node, Math.min(low.get(node)!, low.get(next)!))
      } else if (onStack.has(next)) {
        low.set(node, Math.min(low.get(node)!, index.get(next)!))
      }
    }
    if (low.get(node) === index.get(node)) {
      const component: string[] = []
      let member: string | undefined
      do {
        member = stack.pop()
        onStack.delete(member!)
        component.push(member!)
      } while (member !== node)
      const isCycle = component.length > 1 || (component.length === 1 && adj.get(component[0])?.includes(component[0]))
      if (isCycle) {
        cycles.push({ nodes: component.sort(), example: exampleLoop(component, adj) })
      }
    }
  }

  for (const node of allNodes) {
    if (!index.has(node)) strongConnect(node)
  }
  return cycles.sort((a, b) => b.nodes.length - a.nodes.length)
}

function exampleLoop(component: string[], adj: Map<string, string[]>): string {
  const set = new Set(component)
  const start = component[0]
  const path = [start]
  let current = start
  let guard = 0
  while (guard++ < component.length + 1) {
    const next = (adj.get(current) || []).find(n => set.has(n))
    if (next === undefined) break
    if (next === start) break
    path.push(next)
    current = next
  }
  path.push(start)
  return path.join(' -> ')
}
