import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { ArtifactStore } from '../../src/knowledge/ArtifactStore'
import {
  SqliteArtifactStore,
  artifactDbPath,
  isSqliteAvailable,
} from '../../src/knowledge/SqliteArtifactStore'
import { checksum } from '../../src/knowledge/artifactTypes'
import { createTempProject, cleanup } from '../helpers/tmp'

describe('SqliteArtifactStore', () => {
  let dir: string

  beforeEach(() => {
    dir = createTempProject({})
  })

  afterEach(() => {
    cleanup(dir)
  })

  it('probes availability of the optional native module', () => {
    expect(isSqliteAvailable()).toBe(true)
  })

  it('opens in WAL mode for concurrent access', () => {
    const store = new ArtifactStore(dir)
    const db = store as unknown as { impl: SqliteArtifactStore }
    expect(db.impl.engine).toBe('sqlite')
    // The database file is created immediately; WAL journals appear after the
    // first write. Two connections on the same file must both work.
    expect(existsSync(artifactDbPath(dir))).toBe(true)
  })

  it('supports two concurrent connections on the same database', () => {
    const storeA = new SqliteArtifactStore(dir)
    const storeB = new SqliteArtifactStore(dir)
    storeA.add({ type: 'product', title: 'PRD-A', content: 'from A' })
    storeB.add({ type: 'product', title: 'PRD-B', content: 'from B' })

    expect(storeA.list()).toHaveLength(2)
    expect(storeB.list()).toHaveLength(2)
  })

  it('runs full-text search over title + content with FTS5', () => {
    const store = new SqliteArtifactStore(dir)
    store.add({ type: 'product', title: 'PRD', content: 'Camera onboarding flow with OCR' })
    store.add({ type: 'requirements', title: 'Story', content: 'User can reset the password' })
    store.add({ type: 'design', title: 'UX', content: 'Camera permission prompt copy' })

    const camera = store.fullTextSearch('camera')
    expect(camera.map(a => a.title).sort()).toEqual(['PRD', 'UX'])

    const password = store.fullTextSearch('password')
    expect(password.map(a => a.title)).toEqual(['Story'])
  })

  it('supports FTS5 MATCH syntax (AND / phrases)', () => {
    const store = new SqliteArtifactStore(dir)
    store.add({ type: 'product', title: 'PRD', content: 'login with email and password' })
    store.add({ type: 'product', title: 'PRD2', content: 'login with phone' })

    expect(store.fullTextSearch('login AND password')).toHaveLength(1)
    expect(store.fullTextSearch('login NOT password')).toHaveLength(1)
  })

  it('ranks title matches above content matches (bm25 survives rehydration)', () => {
    const store = new SqliteArtifactStore(dir)
    // Add the content-match artifact FIRST so a naive insertion ordering
    // would put it ahead — the bm25 title weight (5x) must win regardless.
    store.add({ type: 'product', title: 'Something else', content: 'camera camera camera' })
    store.add({ type: 'product', title: 'Camera Permissions', content: 'nothing about it' })

    const results = store.fullTextSearch('camera')
    expect(results.map(a => a.title)).toEqual(['Camera Permissions', 'Something else'])
  })

  it('filters full-text results by type', () => {
    const store = new SqliteArtifactStore(dir)
    store.add({ type: 'product', title: 'PRD', content: 'camera flow' })
    store.add({ type: 'design', title: 'UX', content: 'camera flow' })

    expect(store.fullTextSearch('camera', { type: 'product' })).toHaveLength(1)
  })

  it('performs semantic vector search (sqlite-vec) ranked by distance', () => {
    const store = new SqliteArtifactStore(dir)
    expect(store.isVecAvailable()).toBe(true)
    store.add({ type: 'product', title: 'PRD', content: 'biometric fingerprint authentication' })
    store.add({ type: 'product', title: 'PRD', content: 'push notification scheduling' })
    store.add({ type: 'product', title: 'PRD', content: 'biometric face id sign in' })

    const hits = store.vectorSearch('login with biometrics', { limit: 2 })
    expect(hits).toHaveLength(2)
    // The two biometric artifacts outrank the notification one.
    expect(hits[0].distance).toBeLessThanOrEqual(hits[1].distance)
    expect(hits.map(h => h.artifact.content).join(' ')).toMatch(/biometric/)
  })

  it('vector search degrades to JS cosine similarity without sqlite-vec', () => {
    const store = new SqliteArtifactStore(dir, { noSqliteVec: true })
    expect(store.isVecAvailable()).toBe(false)
    store.add({ type: 'product', title: 'PRD', content: 'biometric fingerprint authentication' })
    store.add({ type: 'product', title: 'PRD', content: 'push notification scheduling' })

    const hits = store.vectorSearch('login with biometrics')
    expect(hits).toHaveLength(2)
    expect(hits[0].artifact.content).toMatch(/biometric/)
  })

  it('runs complex SQL queries with hydrated results (the brief example)', () => {
    const store = new SqliteArtifactStore(dir)
    const adr = store.add({ type: 'architecture', title: 'ADR-001', content: 'Choose SQLite' })
    const adr3 = store.add({ type: 'architecture', title: 'ADR-003', content: 'Choose vector search' })
    const story = store.add({ type: 'requirements', title: 'Story', content: 'Implements ADR-003' })
    store.link(adr3.id, story.id)

    // All architecture artifacts.
    const arch = store.query("SELECT * FROM artifacts WHERE type = 'architecture' ORDER BY title")
    expect(arch.map(a => a.title)).toEqual(['ADR-001', 'ADR-003'])

    // Traceability join: which artifacts are children of ADR-003?
    const children = store.query(
      'SELECT a.* FROM artifacts a JOIN artifact_links l ON l.child_id = a.id WHERE l.parent_id = ?',
      adr3.id
    )
    expect(children.map(a => a.title)).toEqual(['Story'])

    // The link is normalized and reflected on the hydrated parent.
    expect(store.get(adr.id)?.links).toEqual([])
    expect(store.get(adr3.id)?.links).toEqual([story.id])
  })

  it('migrates an existing artifacts.json into the database once', () => {
    const knowledgeDir = join(dir, '.vectalon', 'knowledge')
    const jsonPath = join(knowledgeDir, 'artifacts.json')
    mkdirSync(knowledgeDir, { recursive: true })
    const childId = 'art-legacy-child'
    const legacy = [
      {
        id: 'art-legacy-prd',
        type: 'product',
        title: 'Legacy PRD',
        content: 'body',
        source: 'import',
        status: 'active',
        createdAt: 1,
        updatedAt: 2,
        version: 3,
        meta: { legacy: 'true' },
        links: [childId],
        checksum: checksum('body'),
        history: [{ version: 2, content: 'v2', updatedAt: 1, checksum: checksum('v2') }],
      },
      {
        id: childId,
        type: 'requirements',
        title: 'Legacy Story',
        content: 'story body',
        source: 'import',
        status: 'draft',
        createdAt: 1,
        updatedAt: 1,
        version: 1,
        meta: {},
        links: [],
        checksum: checksum('story body'),
        history: [],
      },
    ]
    writeFileSync(jsonPath, JSON.stringify(legacy))

    const store = new SqliteArtifactStore(dir)
    expect(store.list()).toHaveLength(2)
    const prd = store.get('art-legacy-prd')
    expect(prd?.title).toBe('Legacy PRD')
    expect(prd?.version).toBe(3)
    expect(prd?.meta).toEqual({ legacy: 'true' })
    expect(prd?.links).toEqual([childId])
    expect(prd?.history).toHaveLength(1)
    expect(prd?.createdAt).toBe(1)

    // Re-opening does not re-import.
    const reopened = new SqliteArtifactStore(dir)
    expect(reopened.list()).toHaveLength(2)

    // The JSON file is left untouched on disk.
    expect(existsSync(jsonPath)).toBe(true)
  })

  it('does not migrate when the database already has artifacts', () => {
    const store = new SqliteArtifactStore(dir)
    store.add({ type: 'product', title: 'DB PRD', content: 'db' })
    const jsonPath = join(dir, '.vectalon', 'knowledge', 'artifacts.json')
    writeFileSync(jsonPath, JSON.stringify([{ id: 'x', type: 'product', title: 'J', content: 'j', source: 'import', status: 'draft', createdAt: 1, updatedAt: 1, version: 1, meta: {}, links: [], checksum: 'c', history: [] }]))

    const reopened = new SqliteArtifactStore(dir)
    expect(reopened.list()).toHaveLength(1)
    expect(reopened.list()[0].title).toBe('DB PRD')
  })

  it('keeps history and bumps versions on update', () => {
    const store = new SqliteArtifactStore(dir)
    const artifact = store.add({ type: 'product', title: 'PRD', content: 'v1' })
    store.update(artifact.id, { content: 'v2' })
    store.update(artifact.id, { content: 'v3' })

    const updated = store.get(artifact.id)
    expect(updated?.version).toBe(3)
    expect(updated?.history.map(h => h.content)).toEqual(['v1', 'v2'])
    expect(updated?.history[0].checksum).toBe(checksum('v1'))
  })

  it('cascades links and history when an artifact is removed', () => {
    const store = new SqliteArtifactStore(dir)
    const prd = store.add({ type: 'product', title: 'PRD', content: 'a' })
    const story = store.add({ type: 'requirements', title: 'Story', content: 'b' })
    store.link(prd.id, story.id)

    store.remove(prd.id)
    expect(store.get(story.id)?.links).toEqual([])
    // The link row is gone — the join returns nothing after the cascade.
    expect(
      store.query('SELECT a.* FROM artifacts a JOIN artifact_links l ON l.parent_id = a.id WHERE l.parent_id = ?', prd.id)
    ).toEqual([])
  })

  it('reindexes full-text and vectors when title or content changes', () => {
    const store = new SqliteArtifactStore(dir)
    const artifact = store.add({ type: 'product', title: 'My Screen', content: 'obsolete content' })
    expect(store.fullTextSearch('newword')).toHaveLength(0)

    store.update(artifact.id, { content: 'newword content here' })
    expect(store.fullTextSearch('newword')).toHaveLength(1)
    expect(store.fullTextSearch('obsolete')).toHaveLength(0)
  })

  it('preserves meta as JSON through add/get round trips', () => {
    const store = new SqliteArtifactStore(dir)
    const artifact = store.add({ type: 'telemetry', title: 'Crash', content: 'x', meta: { kind: 'crash', severity: 'p0' } })
    expect(store.get(artifact.id)?.meta).toEqual({ kind: 'crash', severity: 'p0' })
  })
})
