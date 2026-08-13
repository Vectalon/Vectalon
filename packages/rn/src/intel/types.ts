/**
 * Project Intelligence Core — types (Roadmap Phase 1, items 001-010).
 * Business Source License 1.1 (BSL-1.1)
 */
import type { ProjectManifest } from '../projectManifest'
import type { WorkspaceInfo } from '../harness'
import type { RNGraph } from '../harness'
import type { DependencyGraph } from './dependencyGraph'
import type { NativeModuleRegistry } from './nativeRegistry'
import type { RetrievalReport } from './retrieval'

export interface AstLayerStats {
  /** Source files scanned (src/ + app/). */
  filesScanned: number
  /** Files successfully parsed. */
  filesParsed: number
  /** Files the AST layer failed to parse (syntax errors, budget limits). */
  filesFailed: number
  /** Parse success rate 0..1 (roadmap: parse 95%+ of RN codebases). */
  parseRate: number
  /** Total import statements extracted. */
  imports: number
  /** Total export statements extracted. */
  exports: number
}

export interface IndexRunStats {
  /** Files fingerprinted this run. */
  scanned: number
  /** Files whose fingerprint changed since the last run (re-indexed). */
  changed: number
  /** New files since the last run. */
  added: number
  /** Unchanged files (fingerprint cache hit — not re-read). */
  unchanged: number
  /** True when a previous fingerprint cache existed. */
  incremental: boolean
}

export interface LayerTiming {
  layer: string
  ms: number
}

export interface IntelReport {
  schemaVersion: number
  generatedAt: string
  durationMs: number
  /** 001 — project manifest (versioned schema + validation). */
  manifest: ProjectManifest
  manifestIssues: string[]
  /** 002 — workspace / monorepo discovery. */
  workspace: WorkspaceInfo
  /** 003 — dependency graph (internal edges + cycles + external deps). */
  dependencyGraph: DependencyGraph
  /** 004 — AST layer parse statistics. */
  ast: AstLayerStats
  /** 005 — incremental repository index run. */
  index: IndexRunStats
  /** 006/007 — embeddings + component relationship graph (from the knowledge graph). */
  knowledge: RNGraph
  /** 008 — navigation graph (navigators, expo routes, deep-link map). */
  navigation: {
    navigators: RNGraph['navigators']
    expoRoutes: RNGraph['expoRoutes']
    urlScheme: string | null
    deepLinks: string[]
  }
  /** 009 — native module registry. */
  nativeRegistry: NativeModuleRegistry
  /** 010 — knowledge retrieval (index stats + optional query/bench). */
  retrieval: RetrievalReport
  timings: LayerTiming[]
}
