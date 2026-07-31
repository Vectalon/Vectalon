import { cosineSimilarity } from './embeddings'
import type { EmbeddingProvider } from './embeddings'
import type { Artifact, ArtifactType } from './artifactTypes'

export interface IndexedArtifact {
  artifact: Artifact
  project?: string
  team?: string
}

export interface KnowledgeSearchOptions {
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
  score: number
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
  private vectors = new Map<string, number[]>()
  private provider: EmbeddingProvider | null
  private semanticWeight: number

  constructor(provider: EmbeddingProvider | null = null, semanticWeight = 0.5) {
    this.provider = provider
    this.semanticWeight = semanticWeight
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
    return true
  }

  size(): number {
    return this.docs.length
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

    return scored
      .sort(
        (a, b) =>
          this.combined(b, maxLexical, maxSemantic) - this.combined(a, maxLexical, maxSemantic) ||
          b.doc.artifact.updatedAt - a.doc.artifact.updatedAt
      )
      .slice(0, limit)
      .map(r => ({
        artifact: r.doc.artifact,
        project: r.doc.project,
        team: r.doc.team,
        lexicalScore: r.lexical / maxLexical,
        semanticScore: this.provider ? r.semantic : null,
        score: this.combined(r, maxLexical, maxSemantic),
      }))
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
