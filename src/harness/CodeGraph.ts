import { readFileSync, existsSync, readdirSync, statSync } from 'fs'
import { join, relative, extname } from 'path'
import { analyzeSourceFile } from './AstScanner'

export interface GraphNode {
  id: string
  path: string
  type: 'file' | 'directory' | 'package'
  exports: string[]
  imports: string[]
}

export interface GraphEdge {
  from: string
  to: string
  type: 'import' | 'export' | 'depend'
}

export interface CodeGraph {
  nodes: GraphNode[]
  edges: GraphEdge[]
  entryPoints: string[]
  cycles: string[][]
  orphans: string[]
}

const SOURCE_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx'])

function isSourceFile(name: string): boolean {
  return SOURCE_EXTS.has(extname(name))
}

function extractImports(content: string, fileName = 'file.tsx'): string[] {
  const analysis = analyzeSourceFile(content, fileName)
  if (!analysis) return []
  return analysis.imports.map(i => i.source)
}

function extractExports(content: string, fileName = 'file.tsx'): string[] {
  const analysis = analyzeSourceFile(content, fileName)
  if (!analysis) return []
  return analysis.exports.map(e => e.name)
}

function resolveImportPath(importPath: string, currentDir: string, root: string): string | null {
  if (!importPath.startsWith('.')) {
    return null
  }
  const base = join(currentDir, importPath)
  const candidates = [
    base,
    base + '.ts',
    base + '.tsx',
    base + '.js',
    base + '.jsx',
    join(base, 'index.ts'),
    join(base, 'index.tsx'),
    join(base, 'index.js'),
    join(base, 'index.jsx'),
  ]
  for (const c of candidates) {
    if (existsSync(c)) {
      return relative(root, c)
    }
  }
  return null
}

function walkSourceFiles(dir: string, root: string, files: string[]): void {
  for (const entry of readdirSync(dir)) {
    if (entry.startsWith('.') || entry === 'node_modules') continue
    const fullPath = join(dir, entry)
    const stat = statSync(fullPath)
    if (stat.isDirectory()) {
      walkSourceFiles(fullPath, root, files)
    } else if (isSourceFile(entry)) {
      files.push(relative(root, fullPath))
    }
  }
}

export function buildCodeGraph(root: string, srcDir = 'src'): CodeGraph {
  const srcPath = join(root, srcDir)
  if (!existsSync(srcPath)) {
    return { nodes: [], edges: [], entryPoints: [], cycles: [], orphans: [] }
  }

  const filePaths: string[] = []
  walkSourceFiles(srcPath, root, filePaths)

  const nodes: GraphNode[] = []
  const edges: GraphEdge[] = []
  const idToImports = new Map<string, string[]>()

  for (const filePath of filePaths) {
    const fullPath = join(root, filePath)
    const content = readFileSync(fullPath, 'utf-8')
    const imports = extractImports(content, filePath)
    const exports = extractExports(content, filePath)
    const currentDir = join(root, filePath, '..')

    idToImports.set(filePath, imports)
    nodes.push({ id: filePath, path: filePath, type: 'file', exports, imports })

    for (const imp of imports) {
      const resolved = resolveImportPath(imp, currentDir, root)
      if (resolved) {
        edges.push({ from: filePath, to: resolved, type: 'import' })
      } else if (!imp.startsWith('.')) {
        nodes.push({ id: `pkg:${imp}`, path: imp, type: 'package', exports: [], imports: [] })
        edges.push({ from: filePath, to: `pkg:${imp}`, type: 'import' })
      }
    }
  }

  const adjacency = new Map<string, string[]>()
  for (const edge of edges) {
    if (edge.type === 'import') {
      const list = adjacency.get(edge.from) || []
      list.push(edge.to)
      adjacency.set(edge.from, list)
    }
  }

  const entryPoints = filePaths.filter(f => {
    const hasIncoming = edges.some(e => e.to === f && e.type === 'import')
    return !hasIncoming
  })

  const cycles = findAllCycles(adjacency, filePaths)
  const reachable = new Set<string>()

  function dfs(node: string): void {
    if (reachable.has(node)) return
    reachable.add(node)
    const neighbors = adjacency.get(node) || []
    for (const n of neighbors) {
      if (!n.startsWith('pkg:')) {
        dfs(n)
      }
    }
  }

  for (const ep of entryPoints) {
    dfs(ep)
  }

  const orphans = filePaths.filter(f => !reachable.has(f) && !entryPoints.includes(f))

  return { nodes, edges, entryPoints, cycles, orphans }
}

function findAllCycles(adjacency: Map<string, string[]>, nodes: string[]): string[][] {
  const cycles: string[][] = []
  const visited = new Set<string>()
  const recStack = new Set<string>()
  const path: string[] = []

  function dfs(node: string): void {
    visited.add(node)
    recStack.add(node)
    path.push(node)

    const neighbors = adjacency.get(node) || []
    for (const neighbor of neighbors) {
      if (neighbor.startsWith('pkg:')) continue
      if (!recStack.has(neighbor)) {
        if (!visited.has(neighbor)) {
          dfs(neighbor)
        }
      } else {
        const idx = path.indexOf(neighbor)
        if (idx !== -1) {
          const cycle = path.slice(idx)
          if (!cycles.some(c => c.length === cycle.length && c.every((v, i) => v === cycle[i]))) {
            cycles.push(cycle)
          }
        }
      }
    }

    path.pop()
    recStack.delete(node)
  }

  for (const node of nodes) {
    if (!visited.has(node)) {
      dfs(node)
    }
  }

  return cycles
}

export function getDependents(graph: CodeGraph, filePath: string): string[] {
  return graph.edges
    .filter(e => e.to === filePath && e.type === 'import')
    .map(e => e.from)
}

export function getDependencies(graph: CodeGraph, filePath: string): string[] {
  return graph.edges
    .filter(e => e.from === filePath && e.type === 'import' && !e.to.startsWith('pkg:'))
    .map(e => e.to)
}
