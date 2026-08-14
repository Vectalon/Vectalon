/**
 * vectalon arch — Architecture Review Agent (Roadmap Phase 8, item 062)
 * Business Source License 1.1 (BSL-1.1)
 *
 * Deterministic architecture analysis built on the file-level CodeGraph:
 * module boundaries are derived from the src tree, then checked for cycles,
 * layering violations (shared code importing feature code), god modules
 * (high fan-out or oversized files), module over-coupling, wide fan-in
 * blast radius, unreachable orphans, and over-deep nesting. No model calls,
 * no git dependency — hermetic and testable against any source tree.
 */

import { readFileSync } from 'fs'
import { join } from 'path'
import { buildCodeGraph, type CodeGraph } from '../harness/CodeGraph'
import type { ArchFinding, ArchModule, ArchOptions } from './types'

/**
 * Shared (low) layer: code every feature may use. It must never import
 * feature code. `navigation` is excluded on purpose — route definitions
 * legitimately reference screens.
 */
const SHARED_DIRS = new Set([
  'utils', 'lib', 'helpers', 'shared', 'hooks', 'theme', 'constants',
  'types', 'config', 'context', 'i18n', 'translations', 'assets', 'styles',
  'services', 'api', 'store', 'stores', 'state', 'components', 'ui',
])

/** Feature (high) layer: user-facing modules screens live in. */
const FEATURE_DIRS = new Set(['screens', 'features', 'pages', 'modules', 'containers', 'views'])

/** Top-level module dir a file belongs to ('' for files in the src root). */
function moduleOf(file: string, srcDir: string): string {
  const rel = file.startsWith(`${srcDir}/`) ? file.slice(srcDir.length + 1) : file
  const idx = rel.indexOf('/')
  return idx === -1 ? '' : rel.slice(0, idx)
}

export interface ArchAnalysis {
  fileCount: number
  modules: ArchModule[]
  findings: ArchFinding[]
}

/** Run every deterministic architecture check over a project's src tree. */
export function analyzeArchitecture(root: string, options: ArchOptions = {}): ArchAnalysis {
  const srcDir = options.srcDir || 'src'
  const maxFanout = options.maxFanout ?? 12
  const maxModuleFanout = options.maxModuleFanout ?? 8
  const maxFanIn = options.maxFanIn ?? 10
  const maxLines = options.maxLines ?? 600
  const maxDepth = options.maxDepth ?? 5

  const graph = buildCodeGraph(root, srcDir)
  const filePaths = graph.nodes.filter(n => n.type === 'file').map(n => n.id)
  const findings: ArchFinding[] = []

  // Per-file metrics: internal deps, dependents, external packages.
  const depsOf = new Map<string, string[]>()
  const dependentsOf = new Map<string, string[]>()
  const packagesOf = new Map<string, string[]>()
  for (const file of filePaths) {
    depsOf.set(file, [])
    dependentsOf.set(file, [])
    packagesOf.set(file, [])
  }
  for (const edge of graph.edges) {
    if (edge.type !== 'import') continue
    if (edge.to.startsWith('pkg:')) {
      packagesOf.get(edge.from)?.push(edge.to.slice('pkg:'.length))
    } else {
      depsOf.get(edge.from)?.push(edge.to)
      dependentsOf.get(edge.to)?.push(edge.from)
    }
  }

  // Module rollup: files, sibling fan-in/fan-out, external packages.
  const modules = new Map<string, { files: number; fanIn: Set<string>; fanOut: Set<string>; packages: Set<string> }>()
  const getModule = (m: string): { files: number; fanIn: Set<string>; fanOut: Set<string>; packages: Set<string> } => {
    let entry = modules.get(m)
    if (!entry) {
      entry = { files: 0, fanIn: new Set(), fanOut: new Set(), packages: new Set() }
      modules.set(m, entry)
    }
    return entry
  }
  for (const file of filePaths) {
    const m = moduleOf(file, srcDir)
    const entry = getModule(m)
    entry.files++
    for (const d of depsOf.get(file) ?? []) {
      const dm = moduleOf(d, srcDir)
      if (dm && dm !== m) entry.fanOut.add(dm)
    }
    for (const d of dependentsOf.get(file) ?? []) {
      const dm = moduleOf(d, srcDir)
      if (dm && dm !== m) entry.fanIn.add(dm)
    }
    for (const p of packagesOf.get(file) ?? []) entry.packages.add(p)
  }
  const moduleList: ArchModule[] = [...modules.entries()]
    .filter(([m]) => m !== '') // src-root files don't form a module
    .map(([path, entry]) => ({
      path,
      files: entry.files,
      fanIn: entry.fanIn.size,
      fanOut: entry.fanOut.size,
      externalPackages: [...entry.packages].sort(),
    }))
    .sort((a, b) => b.fanOut - a.fanOut || b.files - a.files)

  // Cycles — the hard error: they break init order and tree-shaking.
  for (const cycle of graph.cycles) {
    const chain = [...cycle, cycle[0]].join(' → ')
    findings.push({
      id: 'circular-dependency',
      category: 'structure',
      severity: 'error',
      module: moduleOf(cycle[0] ?? '', srcDir),
      file: chain,
      message: `Circular dependency: ${chain}`,
      suggestion: 'Break the cycle by extracting the shared code into a module both sides import, or invert the dependency direction so the graph stays acyclic.',
    })
  }

  // Layering — shared code must not reach up into features.
  for (const file of filePaths) {
    const m = moduleOf(file, srcDir)
    if (!m || !SHARED_DIRS.has(m)) continue
    for (const d of depsOf.get(file) ?? []) {
      const dm = moduleOf(d, srcDir)
      if (dm && FEATURE_DIRS.has(dm)) {
        findings.push({
          id: 'layering-violation',
          category: 'layering',
          severity: 'warning',
          module: m,
          file,
          message: `${file} (shared layer) imports from ${d} (feature layer)`,
          suggestion: `Shared code must not depend on features — move the helper into ${m} or a lower layer and have ${dm} import it from there instead.`,
        })
      }
    }
  }

  // God modules — fan-out and size make a file the app's single point of change.
  const linesOf = new Map<string, number>()
  for (const file of filePaths) {
    try {
      linesOf.set(file, readFileSync(join(root, file), 'utf-8').split('\n').length)
    } catch {
      linesOf.set(file, 0)
    }
  }
  for (const file of filePaths) {
    const fanout = (depsOf.get(file) ?? []).length
    const lines = linesOf.get(file) ?? 0
    if (fanout >= maxFanout || lines >= maxLines) {
      findings.push({
        id: 'god-module',
        category: 'structure',
        severity: 'warning',
        module: moduleOf(file, srcDir),
        file,
        message: `${file} is a god module — ${fanout} internal dependencies and ${lines} lines`,
        suggestion: 'Split it along its responsibilities and expose narrow interfaces (one deep module per concern).',
      })
    }
  }

  // Module coupling — a module reaching into many siblings is hard to evolve.
  for (const m of moduleList) {
    if (m.fanOut >= maxModuleFanout) {
      findings.push({
        id: 'module-coupling',
        category: 'coupling',
        severity: 'warning',
        module: m.path,
        file: '',
        message: `Module ${m.path} imports from ${m.fanOut} other modules`,
        suggestion: `Reach into fewer modules — extract the shared pieces into ${m.path} or a shared module so features depend on ${m.path} instead of the reverse.`,
      })
    }
  }

  // Wide fan-in — a heavily imported file is a wide change blast radius.
  for (const file of filePaths) {
    const fanIn = (dependentsOf.get(file) ?? []).length
    if (fanIn >= maxFanIn) {
      findings.push({
        id: 'wide-fan-in',
        category: 'coupling',
        severity: 'info',
        module: moduleOf(file, srcDir),
        file,
        message: `${file} has ${fanIn} dependents — every change to it ripples widely`,
        suggestion: 'Stabilize its interface and cover it with tests, or split it into smaller, independently-imported modules.',
      })
    }
  }

  // Orphans — unreachable from any entry point.
  for (const orphan of graph.orphans) {
    findings.push({
      id: 'orphan-module',
      category: 'structure',
      severity: 'info',
      module: moduleOf(orphan, srcDir),
      file: orphan,
      message: `${orphan} is not reachable from any entry point`,
      suggestion: 'Wire it into the app (import it from a screen or route) or delete it — dead code rots silently.',
    })
  }

  // Deep nesting — more directory levels than the project can justify.
  for (const file of filePaths) {
    const rel = file.startsWith(`${srcDir}/`) ? file.slice(srcDir.length + 1) : file
    const depth = rel.split('/').length - 1
    if (depth >= maxDepth) {
      findings.push({
        id: 'deep-nesting',
        category: 'structure',
        severity: 'info',
        module: moduleOf(file, srcDir),
        file,
        message: `${file} is nested ${depth} levels deep under ${srcDir}/`,
        suggestion: `Flatten it — ${maxDepth} levels is usually the most a module needs; move the file up and let imports speak for themselves.`,
      })
    }
  }

  return { fileCount: filePaths.length, modules: moduleList, findings }
}
