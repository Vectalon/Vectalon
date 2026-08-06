import { existsSync, readFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { createRequire } from 'module'
import { reportError } from '../utils/safe'
import { checksum } from './artifactTypes'
import { HashEmbeddingProvider, cosineSimilarity } from './embeddings'
import type { EmbeddingProvider } from './embeddings'
import type { Artifact, ArtifactSource, ArtifactStatus, ArtifactType, ArtifactVersion } from './artifactTypes'
import type { AddArtifactInput, UpdateArtifactInput } from './ArtifactStore'

/**
 * SQLite-backed artifact store — the "Company Brain" core.
 *
 * Replaces the flat `artifacts.json` with a real database so the knowledge
 * base scales to monorepo-size stores and multiple `vectalon serve` processes
 * can read/write concurrently:
 *
 * - **WAL mode** (`journal_mode = WAL`) + `busy_timeout` — concurrent readers
 *   with a single writer; two devs running the harness on one project no longer
 *   race on a shared JSON file.
 * - **FTS5 full-text search** — a `artifact_fts` virtual table over title +
 *   content, ranked with `bm25()` (built into SQLite — no extra dependency).
 * - **Semantic vectors** — every artifact's embedding is stored in a flat
 *   `artifact_vectors` table. When the optional `sqlite-vec` extension loads,
 *   KNN search uses `vec_distance_cosine(vec_from_json(vector), ?)` in SQL;
 *   otherwise it degrades to deterministic JS cosine similarity over the same
 *   stored vectors (identical results, no native dependency required).
 * - **Complex queries** — `query(sql, params)` runs arbitrary SQL over the
 *   `artifacts` table and hydrates rows back into `Artifact` objects (e.g.
 *   `SELECT a.* FROM artifacts a JOIN artifact_links l ON l.parent_id = a.id WHERE l.child_id = ?`).
 *
 * `better-sqlite3` and `sqlite-vec` are **optionalDependencies** — on systems
 * where the native binaries can't load, `ArtifactStore` transparently falls
 * back to the JSON engine (see `JsonArtifactStore`). Nothing breaks; the
 * database is just an upgrade when it's available.
 */

/** Minimal structural type for the better-sqlite3 surface we use — avoids a
 * hard compile-time dependency on the optional native package. */
export interface SqliteStmt {
  run(...params: unknown[]): { changes: number; lastInsertRowid: number | bigint }
  get(...params: unknown[]): Record<string, unknown> | undefined
  all(...params: unknown[]): Record<string, unknown>[]
}

export interface SqliteDb {
  prepare(sql: string): SqliteStmt
  exec(sql: string): void
  pragma(value: string, opts?: { simple?: boolean }): unknown
  close(): void
  transaction<T extends (...args: never[]) => unknown>(fn: T): T
  loadExtension?(path: string): void
}

type DatabaseCtor = new (path: string) => SqliteDb

/**
 * CJS require bound to this module. Unlike `import()`, `require` is not a
 * global — it lives in module scope — so a `new Function` constructor (which
 * executes in the global scope) cannot see it. `createRequire(__filename)`
 * yields a require that resolves relative to this file, works in the compiled
 * CommonJS output and under Jest's VM, and never creates a hard dependency on
 * the optional native packages at build time.
 */
const cjsRequire = createRequire(__filename)

export const VECTOR_DIMENSIONS = 64

export interface SqliteArtifactStoreOptions {
  /** Embedding provider used to index + query vectors (default: deterministic hash). */
  embeddingProvider?: EmbeddingProvider
  /** Opt out of the sqlite-vec extension even when it loads. */
  noSqliteVec?: boolean
}

export interface VectorSearchHit {
  artifact: Artifact
  distance: number
}

export interface StoreSearchOptions {
  limit?: number
  type?: ArtifactType
}

const DEFAULT_LIMIT = 10

export function artifactDbPath(root: string): string {
  return join(root, '.vectalon', 'knowledge', 'artifacts.db')
}

function jsonArtifactsPath(root: string): string {
  return join(root, '.vectalon', 'knowledge', 'artifacts.json')
}

export class SqliteArtifactStore {
  readonly engine = 'sqlite' as const
  private readonly root: string
  private db: SqliteDb
  private readonly provider: EmbeddingProvider
  private vecAvailable = false

  constructor(root: string, options: SqliteArtifactStoreOptions = {}) {
    this.root = root
    this.provider = options.embeddingProvider || new HashEmbeddingProvider()
    const dbPath = artifactDbPath(root)
    mkdirSync(join(root, '.vectalon', 'knowledge'), { recursive: true })
    this.db = openDatabase(dbPath)
    this.configure()
    this.tryLoadVec(options.noSqliteVec)
    this.migrateFromJson()
  }

  dbPath(): string {
    return artifactDbPath(this.root)
  }

  isVecAvailable(): boolean {
    return this.vecAvailable
  }

  /** Release the database handle (WAL checkpoints and closes the file). */
  close(): void {
    try {
      this.db.close()
    } catch (err) {
      reportError(err, 'SqliteArtifactStore: closing database')
    }
  }

  /** True when the optional sqlite-vec extension is loaded. */
  private tryLoadVec(noSqliteVec?: boolean): void {
    if (noSqliteVec || process.env.RN_VECTALON_NO_SQLITE_VEC === '1') return
    try {
      const vec = cjsRequire('sqlite-vec') as { getLoadablePath(): string }
      if (typeof this.db.loadExtension !== 'function') return
      this.db.loadExtension(vec.getLoadablePath())
      // Sanity-check the extension actually registered its functions.
      this.db.prepare('select vec_version() v').get()
      this.vecAvailable = true
    } catch (err) {
      reportError(err, 'SqliteArtifactStore: sqlite-vec unavailable, using JS cosine similarity')
      this.vecAvailable = false
    }
  }

  private configure(): void {
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA busy_timeout = 5000;
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS artifacts (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        source TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        version INTEGER NOT NULL DEFAULT 1,
        meta TEXT NOT NULL DEFAULT '{}',
        checksum TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_artifacts_type ON artifacts(type);
      CREATE INDEX IF NOT EXISTS idx_artifacts_checksum ON artifacts(checksum);
      CREATE TABLE IF NOT EXISTS artifact_links (
        parent_id TEXT NOT NULL REFERENCES artifacts(id) ON DELETE CASCADE,
        child_id TEXT NOT NULL REFERENCES artifacts(id) ON DELETE CASCADE,
        PRIMARY KEY (parent_id, child_id)
      );
      CREATE INDEX IF NOT EXISTS idx_links_child ON artifact_links(child_id);
      CREATE TABLE IF NOT EXISTS artifact_history (
        artifact_id TEXT NOT NULL REFERENCES artifacts(id) ON DELETE CASCADE,
        version INTEGER NOT NULL,
        content TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        checksum TEXT NOT NULL,
        PRIMARY KEY (artifact_id, version)
      );
      CREATE VIRTUAL TABLE IF NOT EXISTS artifact_fts USING fts5(
        artifact_id UNINDEXED,
        title,
        content
      );
      CREATE TABLE IF NOT EXISTS artifact_vectors (
        artifact_id TEXT PRIMARY KEY REFERENCES artifacts(id) ON DELETE CASCADE,
        vector TEXT NOT NULL
      );
    `)
  }

  // ------------------------------------------------------------------ reads

  list(): Artifact[] {
    // rowid is true insertion order — created_at ties within the same
    // millisecond would otherwise scramble on the random id suffix, breaking
    // consumers that rely on "last in list = most recent" (e.g. bundleHistory).
    const rows = this.db.prepare('SELECT * FROM artifacts ORDER BY rowid ASC').all()
    return this.hydrate(rows)
  }

  get(id: string): Artifact | null {
    const row = this.db.prepare('SELECT * FROM artifacts WHERE id = ?').get(id)
    if (!row) return null
    return this.hydrate([row])[0]
  }

  findByType(type: ArtifactType): Artifact[] {
    const rows = this.db.prepare('SELECT * FROM artifacts WHERE type = ? ORDER BY rowid ASC').all(type)
    return this.hydrate(rows)
  }

  hasChecksum(hash: string): boolean {
    return !!this.db.prepare('SELECT 1 FROM artifacts WHERE checksum = ?').get(hash)
  }

  /**
   * Run arbitrary SQL over the store and hydrate the result rows back into
   * `Artifact` objects. The main table is named `artifacts` (columns are the
   * snake_case versions of the Artifact fields); links live in
   * `artifact_links(parent_id, child_id)` and history in
   * `artifact_history`. Non-artifact columns in the result are ignored.
   */
  query(sql: string, ...params: unknown[]): Artifact[] {
    const rows = this.db.prepare(sql).all(...params)
    // Only hydrate rows that actually carry the artifacts shape — a
    // `SELECT COUNT(*)` or a plain join projection would otherwise become
    // garbage Artifact objects with undefined ids.
    return this.hydrate(rows.filter(row => typeof row.id === 'string' && typeof row.title === 'string'))
  }

  /**
   * FTS5 full-text search over title + content, ranked by bm25. Query syntax
   * is the SQLite FTS5 MATCH grammar (e.g. `camera AND login`, `"app crash"`).
   */
  fullTextSearch(query: string, options: StoreSearchOptions = {}): Artifact[] {
    if (!query.trim()) return []
    const limit = typeof options.limit === 'number' && options.limit >= 0 ? options.limit : DEFAULT_LIMIT
    let rows: Record<string, unknown>[]
    try {
      rows = this.db
        .prepare(
          `SELECT artifact_id FROM artifact_fts
           WHERE artifact_fts MATCH ?
           ORDER BY bm25(artifact_fts, 0.0, 5.0, 1.0)
           LIMIT ?`
        )
        .all(query, limit)
    } catch (err) {
      // Unbalanced quotes/parens in user input make MATCH throw — the FTS
      // syntax error must not break search; treat it as no matches.
      reportError(err, 'SqliteArtifactStore: FTS MATCH query failed')
      return []
    }
    const ids = rows.map(r => String(r.artifact_id))
    if (ids.length === 0) return []
    return this.getByIds(ids, options.type)
  }

  /** Semantic (vector) search — sqlite-vec KNN when loaded, JS cosine otherwise. */
  vectorSearch(query: string, options: StoreSearchOptions = {}): VectorSearchHit[] {
    const vector = this.provider.embed(query)
    const limit = typeof options.limit === 'number' && options.limit >= 0 ? options.limit : DEFAULT_LIMIT
    const typeClause = options.type ? 'WHERE artifact_id IN (SELECT id FROM artifacts WHERE type = ?)' : ''

    if (this.vecAvailable) {
      // sqlite-vec parses JSON-array text arguments implicitly (0.1.6 has no
      // vec_from_json — the distance functions accept JSON strings directly).
      const queryJson = JSON.stringify(vector)
      try {
        const rows = this.db
          .prepare(
            `SELECT artifact_id, vec_distance_cosine(vector, ?) AS distance
             FROM artifact_vectors
             ${typeClause}
             ORDER BY distance ASC
             LIMIT ?`
          )
          .all(queryJson, ...(options.type ? [options.type] : []), limit)
        return rows
          .map(r => {
            const artifact = this.get(String(r.artifact_id))
            return artifact ? { artifact, distance: Number(r.distance) } : null
          })
          .filter((r): r is VectorSearchHit => r !== null)
      } catch (err) {
        // A malformed or dimension-mismatched stored vector makes the SQL
        // throw — degrade to the JS cosine path rather than failing search.
        reportError(err, 'SqliteArtifactStore: sqlite-vec KNN failed, using JS cosine')
      }
    }

    // Degraded path — identical math, computed in JS over the same vectors.
    const rows = this.db
      .prepare(
        `SELECT artifact_id, vector FROM artifact_vectors
         ${typeClause}`
      )
      .all(...(options.type ? [options.type] : []))
    return rows
      .map(r => {
        const artifact = this.get(String(r.artifact_id))
        if (!artifact) return null
        let stored: number[] = []
        try {
          stored = JSON.parse(String(r.vector)) as number[]
        } catch (err) {
          reportError(err, 'SqliteArtifactStore: parsing stored vector')
          return null
        }
        return { artifact, distance: cosineSimilarity(stored, vector) }
      })
      .filter((r): r is VectorSearchHit => r !== null)
      // cosineSimilarity is higher-is-closer (opposite of vec_distance_cosine).
      .sort((a, b) => b.distance - a.distance)
      .slice(0, limit)
  }

  // ----------------------------------------------------------------- writes

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
    this.withTransaction(() => {
      this.insertArtifact(artifact)
    })
    return artifact
  }

  update(id: string, patch: UpdateArtifactInput): Artifact | null {
    const existing = this.get(id)
    if (!existing) return null

    const contentChanged = patch.content !== undefined && patch.content !== existing.content
    const titleChanged = patch.title !== undefined && patch.title !== existing.title

    this.withTransaction(() => {
      if (patch.content !== undefined) {
        const version: ArtifactVersion = {
          version: existing.version,
          content: existing.content,
          updatedAt: existing.updatedAt,
          checksum: existing.checksum,
        }
        this.db
          .prepare('INSERT INTO artifact_history (artifact_id, version, content, updated_at, checksum) VALUES (?, ?, ?, ?, ?)')
          .run(id, version.version, version.content, version.updatedAt, version.checksum)
      }

      const title = patch.title !== undefined ? patch.title : existing.title
      const content = patch.content !== undefined ? patch.content : existing.content
      const status = patch.status !== undefined ? patch.status : existing.status
      const version = patch.content !== undefined ? existing.version + 1 : existing.version
      const hash = patch.content !== undefined ? checksum(content) : existing.checksum
      this.db
        .prepare(
          'UPDATE artifacts SET title = ?, content = ?, status = ?, version = ?, checksum = ?, updated_at = ? WHERE id = ?'
        )
        .run(title, content, status, version, hash, Date.now(), id)

      if (contentChanged || titleChanged) {
        this.reindexFts(id, title, content)
        this.indexVector(id, title, content)
      }
    })

    return this.get(id)
  }

  remove(id: string): boolean {
    const existing = this.get(id)
    if (!existing) return false
    this.withTransaction(() => {
      this.db.prepare('DELETE FROM artifact_vectors WHERE artifact_id = ?').run(id)
      this.db.prepare('DELETE FROM artifact_fts WHERE artifact_id = ?').run(id)
      // artifacts row cascades to links + history via FK.
      this.db.prepare('DELETE FROM artifacts WHERE id = ?').run(id)
    })
    return true
  }

  link(parentId: string, childId: string): boolean {
    if (!this.get(parentId) || !this.get(childId)) return false
    this.db
      .prepare('INSERT OR IGNORE INTO artifact_links (parent_id, child_id) VALUES (?, ?)')
      .run(parentId, childId)
    return true
  }

  // ------------------------------------------------------------- internals

  private insertArtifact(artifact: Artifact): void {
    this.insertArtifactRow(artifact)
    for (const childId of artifact.links) {
      this.link(artifact.id, childId)
    }
  }

  /** Insert one artifact: row + FTS + vector + history (links handled separately). */
  private insertArtifactRow(artifact: Artifact): void {
    this.db
      .prepare(
        `INSERT INTO artifacts (id, type, title, content, source, status, created_at, updated_at, version, meta, checksum)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        artifact.id,
        artifact.type,
        artifact.title,
        artifact.content,
        artifact.source,
        artifact.status,
        artifact.createdAt,
        artifact.updatedAt,
        artifact.version,
        JSON.stringify(artifact.meta),
        artifact.checksum
      )
    this.reindexFts(artifact.id, artifact.title, artifact.content)
    this.indexVector(artifact.id, artifact.title, artifact.content)
    for (const version of artifact.history) {
      this.db
        .prepare('INSERT OR IGNORE INTO artifact_history (artifact_id, version, content, updated_at, checksum) VALUES (?, ?, ?, ?, ?)')
        .run(artifact.id, version.version, version.content, version.updatedAt, version.checksum)
    }
  }

  private reindexFts(id: string, title: string, content: string): void {
    this.db.prepare('DELETE FROM artifact_fts WHERE artifact_id = ?').run(id)
    this.db.prepare('INSERT INTO artifact_fts (artifact_id, title, content) VALUES (?, ?, ?)').run(id, title, content)
  }

  private indexVector(id: string, title: string, content: string): void {
    const vector = this.provider.embed(`${title} ${content}`)
    if (vector.length !== VECTOR_DIMENSIONS) return
    this.db
      .prepare('INSERT OR REPLACE INTO artifact_vectors (artifact_id, vector) VALUES (?, ?)')
      .run(id, JSON.stringify(vector))
  }

  private withTransaction(fn: () => void): void {
    const tx = this.db.transaction(fn)
    tx()
  }

  /** Fetch artifacts by id, preserving the given id order (e.g. FTS rank). */
  private getByIds(ids: string[], type?: ArtifactType): Artifact[] {
    if (ids.length === 0) return []
    const placeholders = ids.map(() => '?').join(', ')
    const rows = this.db.prepare(`SELECT * FROM artifacts WHERE id IN (${placeholders})`).all(...ids)
    const byId = new Map(this.hydrate(rows).map(a => [a.id, a]))
    const ordered = ids.map(id => byId.get(id)).filter((a): a is Artifact => !!a)
    return type ? ordered.filter(a => a.type === type) : ordered
  }

  /** Map DB rows back into Artifact objects (parsing meta + loading links/history). */
  private hydrate(rows: Record<string, unknown>[]): Artifact[] {
    if (rows.length === 0) return []
    const ids = rows.map(r => String(r.id))
    const placeholders = ids.map(() => '?').join(', ')

    const linkRows = this.db
      .prepare(`SELECT parent_id, child_id FROM artifact_links WHERE parent_id IN (${placeholders})`)
      .all(...ids)
    const linksByParent = new Map<string, string[]>()
    for (const row of linkRows) {
      const parent = String(row.parent_id)
      const children = linksByParent.get(parent) || []
      children.push(String(row.child_id))
      linksByParent.set(parent, children)
    }

    const historyRows = this.db
      .prepare(`SELECT * FROM artifact_history WHERE artifact_id IN (${placeholders}) ORDER BY version ASC`)
      .all(...ids)
    const historyByArtifact = new Map<string, ArtifactVersion[]>()
    for (const row of historyRows) {
      const artifactId = String(row.artifact_id)
      const history = historyByArtifact.get(artifactId) || []
      history.push({
        version: Number(row.version),
        content: String(row.content),
        updatedAt: Number(row.updated_at),
        checksum: String(row.checksum),
      })
      historyByArtifact.set(artifactId, history)
    }

    return rows.map(row => {
      let meta: Record<string, string> = {}
      try {
        meta = JSON.parse(String(row.meta || '{}')) as Record<string, string>
      } catch (err) {
        reportError(err, 'SqliteArtifactStore: parsing artifact meta')
      }
      return {
        id: String(row.id),
        type: String(row.type) as ArtifactType,
        title: String(row.title),
        content: String(row.content),
        source: String(row.source) as ArtifactSource,
        status: String(row.status) as ArtifactStatus,
        createdAt: Number(row.created_at),
        updatedAt: Number(row.updated_at),
        version: Number(row.version),
        meta,
        links: linksByParent.get(String(row.id)) || [],
        checksum: String(row.checksum),
        history: historyByArtifact.get(String(row.id)) || [],
      }
    })
  }

  /**
   * One-time migration: when the database is empty and the legacy
   * `artifacts.json` exists, import its artifacts (preserving ids, timestamps,
   * versions, history, links, and meta). The JSON file is left on disk — it is
   * simply no longer read once the SQLite store owns the data.
   */
  private migrateFromJson(): number {
    const jsonPath = jsonArtifactsPath(this.root)
    if (!existsSync(jsonPath)) return 0
    const count = this.db.prepare('SELECT COUNT(*) AS c FROM artifacts').get()
    if (!count || Number(count.c) > 0) return 0
    try {
      const imported = JSON.parse(readFileSync(jsonPath, 'utf-8')) as Artifact[]
      if (!Array.isArray(imported) || imported.length === 0) return 0
      // Two passes so parent/child links survive regardless of array order:
      // rows first (FK-clean), then the link rows.
      this.withTransaction(() => {
        for (const artifact of imported) {
          if (!artifact || typeof artifact.id !== 'string') continue
          this.insertArtifactRow(artifact)
        }
        for (const artifact of imported) {
          if (!artifact || typeof artifact.id !== 'string') continue
          for (const childId of artifact.links || []) {
            this.db.prepare('INSERT OR IGNORE INTO artifact_links (parent_id, child_id) VALUES (?, ?)').run(artifact.id, childId)
          }
        }
      })
      return imported.length
    } catch (err) {
      reportError(err, 'SqliteArtifactStore: migrating artifacts.json')
      return 0
    }
  }
}

/** Open the database, throwing when the optional native module cannot load. */
export function openDatabase(dbPath: string): SqliteDb {
  const Database = cjsRequire('better-sqlite3') as DatabaseCtor
  return new Database(dbPath)
}

/** Probe whether better-sqlite3 can actually load on this machine. */
export function isSqliteAvailable(): boolean {
  if (process.env.RN_VECTALON_NO_SQLITE === '1') return false
  try {
    const db = openDatabase(':memory:')
    db.exec('PRAGMA journal_mode = WAL')
    db.close()
    return true
  } catch (err) {
    reportError(err, 'SqliteArtifactStore: better-sqlite3 unavailable, falling back to JSON store')
    return false
  }
}
