/**
 * Knowledge Retrieval API (Roadmap 010) + Semantic Embedding Pipeline (006).
 *
 * Source files are chunked (200-line windows with overlap) and embedded with
 * the deterministic hash provider (offline, no model calls); the shared
 * KnowledgeIndex ranks results by lexical + weighted semantic similarity,
 * provenance confidence, and recency. The benchmark verifies the roadmap's
 * "sub-second retrieval" acceptance criterion.
 * Business Source License 1.1 (BSL-1.1)
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { KnowledgeIndex, HashEmbeddingProvider, checksum } from '../knowledge'
import type { Artifact } from '../knowledge'
import { reportError } from '../utils/safe'

export interface RetrievalHit {
  title: string
  score: number
  lexical: number
  semantic: number | null
}

export interface RetrievalReport {
  /** Total embedded chunks (files split into windows when large). */
  indexedChunks: number
  /** Distinct files indexed. */
  indexedFiles: number
  /** Time to chunk + embed + index everything. */
  buildMs: number
  /** Last --search query, when requested. */
  query?: { query: string; ms: number; results: RetrievalHit[] }
  /** --bench results: query latency distribution + sub-second verdict. */
  bench?: { queries: number; p50Ms: number; maxMs: number; subSecond: boolean }
}

const MAX_SINGLE_CHUNK_LINES = 400
const CHUNK_LINES = 200
const OVERLAP_LINES = 20
const BENCH_QUERIES = ['navigation screen', 'native module', 'api service', 'store hook', 'component styles', 'error handler', 'deep link route', 'test setup']

export interface SourceChunk {
  title: string
  content: string
}

/** Chunk a source file into retrieval windows (overlap keeps boundary context). */
export function chunkSource(path: string, content: string): SourceChunk[] {
  const lines = content.split('\n')
  if (lines.length <= MAX_SINGLE_CHUNK_LINES) {
    return [{ title: path, content }]
  }
  const chunks: SourceChunk[] = []
  for (let start = 0; start < lines.length; start += CHUNK_LINES - OVERLAP_LINES) {
    const end = Math.min(start + CHUNK_LINES, lines.length)
    chunks.push({ title: `${path}#L${start + 1}-${end}`, content: lines.slice(start, end).join('\n') })
    if (end === lines.length) break
  }
  return chunks
}

/** Build a minimal knowledge Artifact from a source chunk (hash checksum, no history). */
export function sourceArtifact(path: string, chunk: SourceChunk): Artifact {
  const now = Date.now()
  const id = `intel:${chunk.title}`
  return {
    id,
    type: 'engineering',
    title: chunk.title,
    content: chunk.content,
    source: 'generated',
    status: 'active',
    createdAt: now,
    updatedAt: now,
    version: 1,
    meta: { kind: 'source', file: path },
    links: [],
    checksum: checksum(chunk.content),
    history: [],
  }
}

/** Chunk + embed + index the given source files. Returns the index and timings. */
export function buildRetrievalIndex(root: string, files: string[]): { index: KnowledgeIndex; report: Pick<RetrievalReport, 'indexedChunks' | 'indexedFiles' | 'buildMs'> } {
  const started = Date.now()
  const index = new KnowledgeIndex(new HashEmbeddingProvider())
  let chunks = 0
  let filesIndexed = 0
  for (const file of files) {
    let content: string
    try {
      content = readFileSync(join(root, file), 'utf-8')
    } catch (err) {
      reportError(err, `intel:retrieval: reading ${file}`)
      continue
    }
    const chunked = chunkSource(file, content)
    for (const chunk of chunked) {
      index.add({ artifact: sourceArtifact(file, chunk) })
      chunks++
    }
    filesIndexed++
  }
  return { index, report: { indexedChunks: chunks, indexedFiles: filesIndexed, buildMs: Date.now() - started } }
}

/** Ranked retrieval for a query, timed. */
export function retrieve(index: KnowledgeIndex, query: string, limit = 5): { ms: number; results: RetrievalHit[] } {
  const started = Date.now()
  const results = index.search(query, { limit, type: 'engineering' }).map(r => ({
    title: r.artifact.title,
    score: r.score,
    lexical: r.lexicalScore,
    semantic: r.semanticScore,
  }))
  return { ms: Date.now() - started, results }
}

/** Sub-second retrieval benchmark (roadmap 010 acceptance). */
export function runRetrievalBench(root: string, files: string[]): { build: Pick<RetrievalReport, 'indexedChunks' | 'indexedFiles' | 'buildMs'>; bench: NonNullable<RetrievalReport['bench']>; query: RetrievalReport['query'] } {
  const { index, report: build } = buildRetrievalIndex(root, files)
  const latencies: number[] = []
  let first: RetrievalReport['query']
  for (const q of BENCH_QUERIES) {
    const { ms, results } = retrieve(index, q, 3)
    latencies.push(ms)
    if (!first) first = { query: q, ms, results }
  }
  const sorted = [...latencies].sort((a, b) => a - b)
  const p50 = sorted[Math.floor(sorted.length / 2)]
  const max = sorted[sorted.length - 1]
  return { build, bench: { queries: latencies.length, p50Ms: p50, maxMs: max, subSecond: max < 1000 }, query: first }
}
