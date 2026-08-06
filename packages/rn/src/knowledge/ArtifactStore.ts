import { ARTIFACT_TYPES } from './artifactTypes'
import { reportError } from '../utils/safe'
import type { ArtifactSource, ArtifactStatus, ArtifactType } from './artifactTypes'
import type { EmbeddingProvider } from './embeddings'
import { SqliteArtifactStore, isSqliteAvailable } from './SqliteArtifactStore'
import type { StoreSearchOptions, VectorSearchHit } from './SqliteArtifactStore'
import { JsonArtifactStore } from './JsonArtifactStore'

export interface AddArtifactInput {
  type: ArtifactType
  title: string
  content: string
  source?: ArtifactSource
  status?: ArtifactStatus
  meta?: Record<string, string>
}

export interface UpdateArtifactInput {
  title?: string
  content?: string
  status?: ArtifactStatus
}

export interface ArtifactStoreOptions {
  /**
   * Engine selection:
   * - `auto` (default) — SQLite when the optional better-sqlite3 module loads
   *   (and `RN_VECTALON_NO_SQLITE=1` is not set), otherwise the JSON fallback.
   * - `sqlite` — prefer SQLite; falls back to JSON when unavailable.
   * - `json` — always the deterministic flat-JSON store.
   */
  engine?: 'auto' | 'sqlite' | 'json'
  /** Embedding provider used for vector search (default: deterministic hash). */
  embeddingProvider?: EmbeddingProvider
}

export type ArtifactStoreEngine = 'sqlite' | 'json'

/**
 * The knowledge base ("Company Brain") artifact store.
 *
 * A facade over two engines sharing one interface:
 *
 * - **SQLite** (`SqliteArtifactStore`) — the default when the optional
 *   `better-sqlite3` native module is available. WAL mode for concurrent
 *   access, FTS5 full-text search, stored semantic vectors searched via
 *   `sqlite-vec` (when that extension loads) or JS cosine similarity, and
 *   arbitrary SQL through `query()`.
 * - **JSON** (`JsonArtifactStore`) — the legacy flat-file engine used as a
 *   graceful fallback on systems where the native module cannot load
 *   (`RN_VECTALON_NO_SQLITE=1` forces it).
 *
 * The interface is unchanged from the flat-file store, so all consumers
 * (MCP tools, TeamStore, workflows, the daemon) work with either engine.
 */
export class ArtifactStore {
  private readonly impl: SqliteArtifactStore | JsonArtifactStore

  constructor(root: string, options: ArtifactStoreOptions = {}) {
    const preferSqlite = options.engine !== 'json' && (options.engine === 'sqlite' || isSqliteAvailable())
    if (preferSqlite) {
      try {
        this.impl = new SqliteArtifactStore(root, { embeddingProvider: options.embeddingProvider })
        return
      } catch (err) {
        // Forced `engine: 'sqlite'` on a machine where better-sqlite3 can't
        // load (or the DB file can't open) must never crash the harness —
        // degrade to the JSON store with a warning.
        reportError(err, 'ArtifactStore: SQLite engine failed, falling back to JSON store')
      }
    }
    this.impl = new JsonArtifactStore(root, { embeddingProvider: options.embeddingProvider })
  }

  /** Which engine is backing this store: `'sqlite'` or `'json'`. */
  get engine(): ArtifactStoreEngine {
    return this.impl.engine
  }

  /** Path of the underlying store file (artifacts.db for SQLite, artifacts.json for JSON). */
  dbPath(): string {
    return this.impl.dbPath()
  }

  /** True when the optional sqlite-vec extension is active (SQLite engine only). */
  isVecAvailable(): boolean {
    return this.impl instanceof SqliteArtifactStore && this.impl.isVecAvailable()
  }

  list(): ArtifactStoreReturn[] {
    return this.impl.list()
  }

  get(id: string): ArtifactStoreReturn | null {
    return this.impl.get(id)
  }

  add(input: AddArtifactInput): ArtifactStoreReturn {
    return this.impl.add(input)
  }

  update(id: string, patch: UpdateArtifactInput): ArtifactStoreReturn | null {
    return this.impl.update(id, patch)
  }

  remove(id: string): boolean {
    return this.impl.remove(id)
  }

  findByType(type: ArtifactType): ArtifactStoreReturn[] {
    return this.impl.findByType(type)
  }

  link(parentId: string, childId: string): boolean {
    return this.impl.link(parentId, childId)
  }

  hasChecksum(hash: string): boolean {
    return this.impl.hasChecksum(hash)
  }

  /** Run arbitrary SQL over the store (SQLite engine only). */
  query(sql: string, ...params: unknown[]): ArtifactStoreReturn[] {
    return this.impl.query(sql, ...params)
  }

  /** FTS5 full-text search (SQLite) or deterministic token scoring (JSON). */
  fullTextSearch(query: string, options?: StoreSearchOptions): ArtifactStoreReturn[] {
    return this.impl.fullTextSearch(query, options)
  }

  /** Semantic vector search — ranked by cosine distance ascending. */
  vectorSearch(query: string, options?: StoreSearchOptions): VectorSearchHit[] {
    return this.impl.vectorSearch(query, options)
  }

  static isValidType(type: string): type is ArtifactType {
    return (ARTIFACT_TYPES as string[]).includes(type)
  }

  /** Probe whether the SQLite engine is usable on this machine. */
  static isSqliteAvailable(): boolean {
    return isSqliteAvailable()
  }

  /** Release the underlying database handle (no-op on the JSON engine). */
  close(): void {
    this.impl.close()
  }
}

/** The artifact shape returned by every read — a structural alias so the
 * facade's signature stays stable without re-exporting the engine internals. */
type ArtifactStoreReturn = import('./artifactTypes').Artifact
