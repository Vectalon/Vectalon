/**
 * vectalon search — Semantic Code Search Agent (Roadmap Phase 11, item 096)
 * Business Source License 1.1 (BSL-1.1)
 *
 * Project-aware search over source: deterministic lexical ranking with
 * line-pinned results; the embedding path (intel) is the optional upgrade.
 * No model calls.
 */

export type SearchVerdict = 'approved' | 'needs-attention' | 'changes-requested'

export interface SearchHit {
  file: string
  line: number
  text: string
  score: number
}

export interface SearchReport {
  scannedAt: number
  root: string
  query: string
  filesScanned: number
  hits: SearchHit[]
  ms: number
  findings: Array<{ id: string; severity: 'info'; message: string; suggestion: string }>
  verdict: SearchVerdict
}
