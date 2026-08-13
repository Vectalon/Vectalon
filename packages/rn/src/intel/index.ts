/**
 * Project Intelligence Core (Roadmap Phase 1, items 001-010) — one
 * deterministic pass over the project that produces the canonical manifest,
 * workspace discovery, dependency graph, AST stats, incremental index,
 * component + navigation graphs, native registry, and sub-second knowledge
 * retrieval. Exposed as `vectalon intel`.
 * Business Source License 1.1 (BSL-1.1)
 */
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'fs'
import { join, relative, resolve } from 'path'
import { detectWorkspace, buildKnowledgeGraph, analyzeSourceFile, extractExpoRoutes } from '../harness'
import { detectUrlScheme } from '../utils/deepLink'
import { buildProjectManifest, validateProjectManifest, PROJECT_MANIFEST_SCHEMA_VERSION } from '../projectManifest'
import { reportError } from '../utils/safe'
import { buildDependencyGraph, collectSourceFiles } from './dependencyGraph'
import { buildNativeRegistry } from './nativeRegistry'
import { buildRetrievalIndex, retrieve, runRetrievalBench } from './retrieval'
import type { IntelReport, AstLayerStats, IndexRunStats, LayerTiming } from './types'
import type { RNGraph } from '../harness'

export interface IntelOptions {
  /** Run the sub-second retrieval benchmark (010 acceptance). */
  bench?: boolean
  /** Run one retrieval query and include ranked results. */
  search?: string
}

export interface IntelOutput {
  report: IntelReport
  /** Where report.json was written, when persisted. */
  reportPath: string
}

export function intelDocsDir(root: string): string {
  return join(root, 'docs', 'vectalon', 'intel')
}

/** Incremental index fingerprint cache (005) — .vectalon/intel/index.json. */
interface FingerprintCache {
  version: number
  lastRun: string
  files: Record<string, { mtimeMs: number; size: number; hash: string }>
}

function fingerprintCachePath(root: string): string {
  return join(root, '.vectalon', 'intel', 'index.json')
}

function readFingerprintCache(root: string): FingerprintCache | null {
  try {
    const path = fingerprintCachePath(root)
    if (!existsSync(path)) return null
    return JSON.parse(readFileSync(path, 'utf-8')) as FingerprintCache
  } catch (err) {
    reportError(err, 'intel: reading fingerprint cache')
    return null
  }
}

function writeFingerprintCache(root: string, cache: FingerprintCache): void {
  try {
    const path = fingerprintCachePath(root)
    mkdirSync(join(root, '.vectalon', 'intel'), { recursive: true })
    writeFileSync(path, JSON.stringify(cache, null, 2))
  } catch (err) {
    reportError(err, 'intel: writing fingerprint cache')
  }
}

function hashContent(content: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < content.length; i++) {
    h ^= content.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16)
}

/** Incremental pass (005): fingerprint every file, re-index only the changed. */
function runIncrementalIndex(root: string, files: string[]): IndexRunStats {
  const prev = readFingerprintCache(root)
  const stats: IndexRunStats = { scanned: files.length, changed: 0, added: 0, unchanged: 0, incremental: prev !== null }
  const next: FingerprintCache['files'] = {}
  for (const file of files) {
    try {
      const abs = join(root, file)
      const stat = existsSync(abs) ? statSync(abs) : null
      const content = readFileSync(abs, 'utf-8')
      const fp = { mtimeMs: stat?.mtimeMs ?? 0, size: content.length, hash: hashContent(content) }
      next[file] = fp
      const old = prev?.files[file]
      if (!old) stats.added++
      else if (old.mtimeMs === fp.mtimeMs && old.size === fp.size && old.hash === fp.hash) stats.unchanged++
      else stats.changed++
    } catch (err) {
      reportError(err, `intel:index: ${file}`)
    }
  }
  writeFingerprintCache(root, { version: 1, lastRun: new Date().toISOString(), files: next })
  return stats
}

/** 004 — AST layer statistics over every source file. */
function runAstStats(root: string, files: string[]): AstLayerStats {
  const stats: AstLayerStats = { filesScanned: files.length, filesParsed: 0, filesFailed: 0, parseRate: 0, imports: 0, exports: 0 }
  for (const file of files) {
    try {
      const content = readFileSync(join(root, file), 'utf-8')
      const analysis = analyzeSourceFile(content, file)
      if (!analysis) {
        stats.filesFailed++
        continue
      }
      stats.filesParsed++
      stats.imports += analysis.imports.length
      stats.exports += analysis.exports.length
    } catch (err) {
      reportError(err, `intel:ast: ${file}`)
      stats.filesFailed++
    }
  }
  stats.parseRate = stats.filesScanned > 0 ? stats.filesParsed / stats.filesScanned : 1
  return stats
}

/**
 * Repository-wide source file list: the project itself plus every workspace
 * member package when the scanned root is a workspace root (Roadmap 002/005:
 * index the entire repository). Paths are relative to the scanned root.
 */
function collectWorkspaceFiles(root: string): string[] {
  const ws = detectWorkspace(root)
  const members = ws.isMonorepo && ws.root && resolve(ws.root) === resolve(root) ? ws.packages : []
  const files = new Set<string>(collectSourceFiles(root))
  for (const member of members) {
    const rel = relative(root, member)
    for (const f of collectSourceFiles(member)) files.add(rel ? `${rel}/${f}` : f)
  }
  return [...files].sort()
}

/** Merge per-package knowledge graphs (workspace-aware component/nav/native layers). */
function buildWorkspaceKnowledgeGraph(root: string, workspaceDirs: string[]): RNGraph {
  if (workspaceDirs.length === 0) return buildKnowledgeGraph(root)
  const merged: RNGraph = {
    components: [], edges: [], hooks: [], navigators: [], nativeModules: [], stores: [], expoRoutes: [], reRenderImpact: [], platformVariants: [],
  }
  for (const dir of workspaceDirs) {
    const rel = relative(root, dir)
    const srcDir = rel ? `${rel}/src` : 'src'
    const g = buildKnowledgeGraph(root, srcDir)
    const routes = extractExpoRoutes(root, rel ? `${rel}/app` : undefined)
    merged.components.push(...g.components)
    merged.edges.push(...g.edges)
    merged.hooks.push(...g.hooks)
    merged.navigators.push(...g.navigators)
    merged.nativeModules.push(...g.nativeModules)
    merged.stores.push(...g.stores)
    merged.expoRoutes.push(...routes)
    merged.reRenderImpact.push(...g.reRenderImpact)
    merged.platformVariants.push(...g.platformVariants)
  }
  return merged
}

/** 008 — navigation graph: navigators + expo routes + deep-link map. */
function buildNavigationLayer(root: string, graph: RNGraph) {
  const urlScheme = detectUrlScheme(root)
  const deepLinks = graph.expoRoutes
    .filter(r => !r.isLayout)
    .map(r => (urlScheme ? `${urlScheme}://${r.route.replace(/^\//, '')}` : r.route))
    .slice(0, 200)
  return { navigators: graph.navigators, expoRoutes: graph.expoRoutes, urlScheme, deepLinks }
}

function timed<T>(layer: string, fn: () => T): { value: T; ms: number } {
  const started = Date.now()
  const value = fn()
  return { value, ms: Date.now() - started }
}

/** Run every layer of the Project Intelligence Core against a project root. */
export function runProjectIntel(root: string, options: IntelOptions = {}): IntelOutput {
  const startedAt = Date.now()
  const timings: LayerTiming[] = []
  const t = <T>(layer: string, fn: () => T): T => {
    const { value, ms } = timed(layer, fn)
    timings.push({ layer, ms })
    return value
  }

  const workspace = t('002-workspace', () => detectWorkspace(root))
  const isWorkspaceRoot = workspace.isMonorepo && workspace.root && resolve(workspace.root) === resolve(root)
  const workspaceDirs = isWorkspaceRoot ? workspace.packages : []
  const files = t('source-scan', () => collectWorkspaceFiles(root))

  const manifest = t('001-manifest', () => buildProjectManifest(root))
  const dependencyGraph = t('003-deps', () => buildDependencyGraph(root, files))
  const ast = t('004-ast', () => runAstStats(root, files))
  const index = t('005-index', () => runIncrementalIndex(root, files))
  const knowledge = t('007-components', () => buildWorkspaceKnowledgeGraph(root, workspaceDirs))
  const navigation = t('008-navigation', () => buildNavigationLayer(root, knowledge))
  const nativeRegistry = t('009-native', () => {
    const extraDirs: string[] = []
    const specDirs: string[] = []
    for (const dir of workspaceDirs) {
      const rel = relative(root, dir)
      if (!rel) continue
      extraDirs.push(`${rel}/ios`, `${rel}/android`)
      specDirs.push(join(root, rel, 'src', 'specs'))
    }
    return buildNativeRegistry(root, knowledge, extraDirs, specDirs)
  })

  const retrievalBuild = t('006+010-retrieval', () => buildRetrievalIndex(root, files).report)
  let retrieval: IntelReport['retrieval'] = retrievalBuild
  if (options.bench) {
    const benchRun = t('010-bench', () => runRetrievalBench(root, files))
    retrieval = { ...benchRun.build, bench: benchRun.bench, query: benchRun.query }
  } else if (options.search) {
    const { index: idx, report: build } = t('006+010-retrieval', () => buildRetrievalIndex(root, files))
    const q = t('010-search', () => retrieve(idx, options.search!, 5))
    retrieval = { ...build, query: { query: options.search, ms: q.ms, results: q.results } }
  }

  const report: IntelReport = {
    schemaVersion: PROJECT_MANIFEST_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    manifest,
    manifestIssues: validateProjectManifest(manifest),
    workspace,
    dependencyGraph,
    ast,
    index,
    knowledge,
    navigation,
    nativeRegistry,
    retrieval,
    timings,
  }

  const reportPath = join(intelDocsDir(root), 'report.json')
  try {
    mkdirSync(intelDocsDir(root), { recursive: true })
    writeFileSync(reportPath, JSON.stringify(report, null, 2))
    writeFileSync(join(intelDocsDir(root), 'report.md'), renderIntelMarkdown(report))
  } catch (err) {
    reportError(err, 'intel: writing report')
  }

  return { report, reportPath }
}

/** Compact per-layer terminal/markdown summary. */
export function renderIntelMarkdown(report: IntelReport): string {
  const lines: string[] = []
  lines.push(`# Project Intelligence — ${report.generatedAt.slice(0, 10)}`)
  lines.push('')
  lines.push(`- **001 Manifest** — ${report.manifest.projectName} · RN ${report.manifest.rnVersion || 'unknown'} · ${report.manifest.tooling || 'unknown'}${report.manifest.schemaVersion ? ` · schema v${report.manifest.schemaVersion}` : ''}${report.manifestIssues.length > 0 ? ` · ⚠ ${report.manifestIssues.length} issue(s)` : ''}`)
  lines.push(`- **002 Workspace** — ${report.workspace.isMonorepo ? `${report.workspace.manager} monorepo (${report.workspace.packages.length} packages)` : 'single package'}`)
  lines.push(`- **003 Dependency graph** — ${report.dependencyGraph.nodes.length} files · ${report.dependencyGraph.internalEdges.length} internal edges · ${report.dependencyGraph.external.length} external imports · ${report.dependencyGraph.cycles.length} cycle(s)`)
  if (report.dependencyGraph.cycles.length > 0) {
    for (const c of report.dependencyGraph.cycles.slice(0, 5)) {
      lines.push(`  - ⭕ ${c.example}`)
    }
  }
  lines.push(`- **004 AST layer** — ${report.ast.filesParsed}/${report.ast.filesScanned} parsed (${(report.ast.parseRate * 100).toFixed(1)}%) · ${report.ast.imports} imports · ${report.ast.exports} exports`)
  lines.push(`- **005 Index** — ${report.index.added} added · ${report.index.changed} changed · ${report.index.unchanged} unchanged (${report.index.incremental ? 'incremental' : 'first run'})`)
  lines.push(`- **007 Components** — ${report.knowledge.components.length} components · ${report.knowledge.edges.length} edges · ${report.knowledge.reRenderImpact.length} shared re-render risks`)
  lines.push(`- **008 Navigation** — ${report.navigation.navigators.length} navigator(s) · ${report.navigation.expoRoutes.length} expo route(s)${report.navigation.urlScheme ? ` · scheme ${report.navigation.urlScheme}` : ''}`)
  lines.push(`- **009 Native registry** — ${report.nativeRegistry.entries.length} modules · ${report.nativeRegistry.totals.pods} pods · ${report.nativeRegistry.totals.podspecs} podspecs · ${report.nativeRegistry.totals.turboSpecs} TurboModule specs`)
  lines.push(`- **010 Retrieval** — ${report.retrieval.indexedChunks} chunks from ${report.retrieval.indexedFiles} files (build ${report.retrieval.buildMs}ms)${report.retrieval.bench ? ` · bench p50 ${report.retrieval.bench.p50Ms}ms / max ${report.retrieval.bench.maxMs}ms · sub-second ${report.retrieval.bench.subSecond ? '✓' : '✗'}` : ''}`)
  if (report.retrieval.query) {
    lines.push('')
    lines.push(`### Search: ${report.retrieval.query.query} (${report.retrieval.query.ms}ms)`)
    for (const hit of report.retrieval.query.results) {
      lines.push(`- ${hit.title} — score ${hit.score.toFixed(3)}`)
    }
  }
  lines.push('')
  lines.push(`Total: ${report.durationMs}ms`)
  return lines.join('\n')
}
