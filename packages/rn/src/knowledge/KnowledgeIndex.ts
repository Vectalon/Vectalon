import { cosineSimilarity } from './embeddings'
import type { EmbeddingProvider } from './embeddings'
import type { RemoteEmbeddingProvider } from './remoteEmbeddings'
import type { Artifact, ArtifactType } from './artifactTypes'
import { rankByConfidence } from './provenance'
import type { Provenance, ProvenanceOptions, RankedResult } from './provenance'

export interface IndexedArtifact {
  artifact: Artifact
  project?: string
  team?: string
}

export interface KnowledgeSearchOptions extends ProvenanceOptions {
  team?: string
  project?: string
  type?: ArtifactType
  limit?: number
}

export interface KnowledgeSearchResult {
  artifact: Artifact
  project?: string
  team?: string
  lexicalScore: number
  semanticScore: number | null
  /** Relevance score (lexical + weighted semantic). */
  score: number
  /** Deterministic 0..1 provenance confidence. */
  confidence: number
  /** Full provenance record (source, staleness date, refreshed at). */
  provenance: Provenance
  /** What retrieval sorts by: score × confidenceFactor. */
  rankedScore: number
}

const TITLE_WEIGHT = 3
const DEFAULT_LIMIT = 5

interface ScoredDocument {
  doc: IndexedArtifact
  lexical: number
  semantic: number
}

export class KnowledgeIndex {
  private docs: IndexedArtifact[] = []
  /** Vectors computed by the sync (hash) provider. */
  private vectors = new Map<string, number[]>()
  /** Vectors computed by the remote embedding API — kept separate so the two
   * providers never collide (serve attaches both by default). */
  private remoteVectors = new Map<string, number[]>()
  private provider: EmbeddingProvider | null
  private remoteProvider: RemoteEmbeddingProvider | null
  private semanticWeight: number

  constructor(
    provider: EmbeddingProvider | null = null,
    semanticWeight = 0.5,
    remoteProvider: RemoteEmbeddingProvider | null = null
  ) {
    this.provider = provider
    this.semanticWeight = semanticWeight
    // Accept a remote provider directly; it wins over the sync provider for
    // searchRemote but both can coexist (sync search uses the hash seam).
    this.remoteProvider = remoteProvider
  }

  add(doc: IndexedArtifact): void {
    this.docs.push(doc)
    if (this.provider) {
      this.vectors.set(doc.artifact.id, this.provider.embed(`${doc.artifact.title} ${doc.artifact.content}`))
    }
  }

  addAll(docs: IndexedArtifact[]): void {
    for (const doc of docs) this.add(doc)
  }

  remove(artifactId: string): boolean {
    const index = this.docs.findIndex(d => d.artifact.id === artifactId)
    if (index === -1) return false
    this.docs.splice(index, 1)
    this.vectors.delete(artifactId)
    this.remoteVectors.delete(artifactId)
    return true
  }

  size(): number {
    return this.docs.length
  }

  /**
   * Async semantic search backed by a real embedding API. Falls back to the
   * sync `search` when no remote provider is configured (e.g. hash-only setups
   * or a provider that failed to build).
   */
  async searchRemote(query: string, options: KnowledgeSearchOptions = {}): Promise<KnowledgeSearchResult[]> {
    if (!this.remoteProvider) {
      return this.search(query, options)
    }

    const terms = tokenize(query)
    if (terms.length === 0) return []

    const candidates = this.docs.filter(doc => {
      if (options.project && doc.project !== options.project) return false
      if (options.team && doc.team !== options.team) return false
      if (options.type && doc.artifact.type !== options.type) return false
      return true
    })
    if (candidates.length === 0) return []

    // Compute the query + every candidate vector through the real API. Vectors
    // are cached so repeated searches don't re-call the API for the same docs.
    const queryVector = await this.remoteProvider.embed(query)
    const scored: ScoredDocument[] = []
    for (const doc of candidates) {
      const lexical = lexicalScore(doc, terms)
      const vector = await this.remoteVector(doc.artifact)
      const semantic = cosineSimilarity(vector, queryVector)
      if (lexical > 0 || semantic > 0) {
        scored.push({ doc, lexical, semantic })
      }
    }

    if (scored.length === 0) return []

    const maxLexical = Math.max(1, ...scored.map(r => r.lexical))
    const maxSemantic = Math.max(Number.EPSILON, ...scored.map(r => r.semantic))
    const limit = typeof options.limit === 'number' && options.limit >= 0 ? options.limit : DEFAULT_LIMIT

    // Single scorer: rankByConfidence attaches provenance + confidence and
    // sorts by relevance × confidenceFactor, then recency — the same ranking
    // definition every retrieval path uses.
    const byId = new Map(scored.map(r => [r.doc.artifact.id, r]))
    return rankByConfidence(
      scored.map(r => ({ artifact: r.doc.artifact, score: this.combinedRemote(r, maxLexical, maxSemantic) })),
      options
    )
      .slice(0, limit)
      .map(ranked => this.toResult(byId.get(ranked.artifact.id)!, maxLexical, maxSemantic, options, true, ranked))
  }

  private toResult(
    r: ScoredDocument,
    maxLexical: number,
    maxSemantic: number,
    options: KnowledgeSearchOptions,
    remote: boolean,
    ranked: RankedResult
  ): KnowledgeSearchResult {
    return {
      artifact: ranked.artifact,
      project: r.doc.project,
      team: r.doc.team,
      lexicalScore: r.lexical / maxLexical,
      semanticScore: remote ? r.semantic : this.provider ? r.semantic : null,
      score: ranked.score,
      confidence: ranked.confidence,
      provenance: ranked.provenance,
      rankedScore: ranked.rankedScore,
    }
  }

  private combinedRemote(r: ScoredDocument, maxLexical: number, maxSemantic: number): number {
    const lexicalNorm = r.lexical / maxLexical
    const semanticNorm = r.semantic / maxSemantic
    return lexicalNorm + this.semanticWeight * semanticNorm
  }

  private async remoteVector(artifact: Artifact): Promise<number[]> {
    const cached = this.remoteVectors.get(artifact.id)
    if (cached) return cached
    const vector = await this.remoteProvider!.embed(`${artifact.title} ${artifact.content}`)
    this.remoteVectors.set(artifact.id, vector)
    return vector
  }

  search(query: string, options: KnowledgeSearchOptions = {}): KnowledgeSearchResult[] {
    const terms = tokenize(query)
    if (terms.length === 0) return []

    const candidates = this.docs.filter(doc => {
      if (options.project && doc.project !== options.project) return false
      if (options.team && doc.team !== options.team) return false
      if (options.type && doc.artifact.type !== options.type) return false
      return true
    })

    const queryVector = this.provider ? this.provider.embed(query) : []

    const scored = candidates
      .map(doc => {
        const lexical = lexicalScore(doc, terms)
        const semantic = this.provider
          ? cosineSimilarity(this.vectorFor(doc.artifact), queryVector)
          : 0
        return { doc, lexical, semantic }
      })
      .filter(r => (this.provider ? r.lexical > 0 || r.semantic > 0 : r.lexical > 0))

    if (scored.length === 0) return []

    const maxLexical = Math.max(1, ...scored.map(r => r.lexical))
    const maxSemantic = Math.max(Number.EPSILON, ...scored.map(r => r.semantic))
    const limit = typeof options.limit === 'number' && options.limit >= 0 ? options.limit : DEFAULT_LIMIT

    // Same single scorer as searchRemote (see above).
    const byId = new Map(scored.map(r => [r.doc.artifact.id, r]))
    return rankByConfidence(
      scored.map(r => ({ artifact: r.doc.artifact, score: this.combined(r, maxLexical, maxSemantic) })),
      options
    )
      .slice(0, limit)
      .map(ranked => this.toResult(byId.get(ranked.artifact.id)!, maxLexical, maxSemantic, options, false, ranked))
  }

  private combined(r: ScoredDocument, maxLexical: number, maxSemantic: number): number {
    const lexicalNorm = r.lexical / maxLexical
    const semanticNorm = this.provider ? r.semantic / maxSemantic : 0
    return lexicalNorm + this.semanticWeight * semanticNorm
  }

  private vectorFor(artifact: Artifact): number[] {
    const cached = this.vectors.get(artifact.id)
    if (cached) return cached
    const vector = (this.provider as EmbeddingProvider).embed(`${artifact.title} ${artifact.content}`)
    this.vectors.set(artifact.id, vector)
    return vector
  }
}

function tokenize(input: string): string[] {
  return input
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(t => t.length > 1)
}

function countOccurrences(haystack: string, needle: string): number {
  if (!haystack || !needle) return 0
  let count = 0
  let index = 0
  while ((index = haystack.indexOf(needle, index)) !== -1) {
    count++
    index += needle.length
  }
  return count
}

function lexicalScore(doc: IndexedArtifact, terms: string[]): number {
  const title = doc.artifact.title.toLowerCase()
  const content = doc.artifact.content.toLowerCase()
  let score = 0
  for (const term of terms) {
    score += countOccurrences(title, term) * TITLE_WEIGHT + countOccurrences(content, term)
  }
  return score
}
