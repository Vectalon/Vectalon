import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { reportError } from '../utils/safe'
import { checksum } from './artifactTypes'
import { HashEmbeddingProvider, cosineSimilarity } from './embeddings'
import type { EmbeddingProvider } from './embeddings'
import type { Artifact, ArtifactType } from './artifactTypes'
import type { AddArtifactInput, UpdateArtifactInput } from './ArtifactStore'
import type { StoreSearchOptions, VectorSearchHit } from './SqliteArtifactStore'

/**
 * Legacy flat-JSON artifact store engine — the graceful fallback when the
 * optional `better-sqlite3` native module cannot load (constrained CI, missing
 * toolchain, `RN_VECTALON_NO_SQLITE=1`). Behaviorally identical to the old
 * `ArtifactStore`; it is also what `ArtifactStore({ engine: 'json' })` uses for
 * the deterministic baseline.
 */

const MAX_HISTORY = 10

export class JsonArtifactStore {
  readonly engine = 'json' as const
  private readonly filePath: string
  private readonly provider: EmbeddingProvider
  private artifacts: Artifact[] = []

  constructor(root: string, options: { embeddingProvider?: EmbeddingProvider } = {}) {
    this.filePath = join(root, '.vectalon', 'knowledge', 'artifacts.json')
    this.provider = options.embeddingProvider || new HashEmbeddingProvider()
    this.artifacts = this.load()
  }

  dbPath(): string {
    return this.filePath
  }

  /** No-op — the JSON engine holds no persistent handle. */
  close(): void {
    // nothing to release
  }

  list(): Artifact[] {
    return this.artifacts
  }

  get(id: string): Artifact | null {
    return this.artifacts.find(a => a.id === id) || null
  }

  add(input: AddArtifactInput): Artifact {
    const now = Date.now()
    const artifact: Artifact = {
      id: `art-${now}-${Math.random().toString(36).slice(2, 8)}`,
      type: input.type,
      title: input.title,
      content: input.content,
      source: input.source || 'import',
      status: input.status || 'draft',
      createdAt: now,
      updatedAt: now,
      version: 1,
      meta: input.meta || {},
      links: [],
      checksum: checksum(input.content),
      history: [],
    }
    this.artifacts.push(artifact)
    this.persist()
    return artifact
  }

  update(id: string, patch: UpdateArtifactInput): Artifact | null {
    const artifact = this.get(id)
    if (!artifact) return null

    if (patch.content !== undefined) {
      artifact.history.push({
        version: artifact.version,
        content: artifact.content,
        updatedAt: artifact.updatedAt,
        checksum: artifact.checksum,
      })
      artifact.history = artifact.history.slice(-MAX_HISTORY)
      artifact.content = patch.content
      artifact.checksum = checksum(patch.content)
      artifact.version++
    }

    if (patch.title !== undefined) artifact.title = patch.title
    if (patch.status !== undefined) artifact.status = patch.status

    artifact.updatedAt = Date.now()
    this.persist()
    return artifact
  }

  remove(id: string): boolean {
    const index = this.artifacts.findIndex(a => a.id === id)
    if (index === -1) return false
    this.artifacts.splice(index, 1)
    this.persist()
    return true
  }

  findByType(type: ArtifactType): Artifact[] {
    return this.artifacts.filter(a => a.type === type)
  }

  link(parentId: string, childId: string): boolean {
    const parent = this.get(parentId)
    if (!parent || !this.get(childId)) return false
    if (!parent.links.includes(childId)) {
      parent.links.push(childId)
      this.persist()
    }
    return true
  }

  hasChecksum(hash: string): boolean {
    return this.artifacts.some(a => a.checksum === hash)
  }

  /** Arbitrary SQL is a SQLite-engine capability — the JSON fallback cannot
   * execute queries. Throws so callers know to use the database engine. */
  query(_sql: string, ..._params: unknown[]): Artifact[] {
    throw new Error(
      'ArtifactStore.query() requires the SQLite engine (better-sqlite3). The JSON fallback store cannot execute SQL.'
    )
  }

  /** Deterministic full-text search over the in-memory artifacts (substring
   * token scoring — the FTS5 engine is the SQLite upgrade). */
  fullTextSearch(query: string, options: StoreSearchOptions = {}): Artifact[] {
    const terms = tokenize(query)
    if (terms.length === 0) return []
    const limit = typeof options.limit === 'number' && options.limit >= 0 ? options.limit : 10
    const scored = this.artifacts
      .filter(a => !options.type || a.type === options.type)
      .map(a => {
        const title = a.title.toLowerCase()
        const content = a.content.toLowerCase()
        let score = 0
        for (const term of terms) {
          score += countOccurrences(title, term) * 3 + countOccurrences(content, term)
        }
        return { artifact: a, score }
      })
      .filter(r => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
    return scored.map(r => r.artifact)
  }

  /** Semantic search — cosine similarity over on-the-fly hash embeddings. */
  vectorSearch(query: string, options: StoreSearchOptions = {}): VectorSearchHit[] {
    const vector = this.provider.embed(query)
    const limit = typeof options.limit === 'number' && options.limit >= 0 ? options.limit : 10
    return this.artifacts
      .filter(a => !options.type || a.type === options.type)
      .map(a => ({ artifact: a, distance: cosineSimilarity(this.provider.embed(`${a.title} ${a.content}`), vector) }))
      // cosineSimilarity is higher-is-closer.
      .sort((a, b) => b.distance - a.distance)
      .slice(0, limit)
  }

  private load(): Artifact[] {
    try {
      if (existsSync(this.filePath)) {
        return JSON.parse(readFileSync(this.filePath, 'utf-8'))
      }
    } catch (err) {
      reportError(err, 'ArtifactStore: reading artifact store')
    }
    return []
  }

  private persist(): void {
    mkdirSync(join(this.filePath, '..'), { recursive: true })
    writeFileSync(this.filePath, JSON.stringify(this.artifacts, null, 2))
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
