import { existsSync } from 'fs'
import { join } from 'path'
import { ArtifactStore } from '../../src/knowledge/ArtifactStore'
import { artifactDbPath } from '../../src/knowledge/SqliteArtifactStore'
import { checksum } from '../../src/knowledge/artifactTypes'
import { createTempProject, cleanup } from '../helpers/tmp'

const JSON_PATH = (dir: string) => join(dir, '.vectalon', 'knowledge', 'artifacts.json')

describe('ArtifactStore', () => {
  let dir: string

  beforeEach(() => {
    dir = createTempProject({})
  })

  afterEach(() => {
    cleanup(dir)
  })

  it('uses the SQLite engine when better-sqlite3 is available', () => {
    const store = new ArtifactStore(dir)
    expect(store.engine).toBe('sqlite')
    expect(store.dbPath()).toBe(artifactDbPath(dir))
  })

  it('starts empty and does not create the JSON file', () => {
    const store = new ArtifactStore(dir)
    expect(store.list()).toEqual([])
    expect(existsSync(JSON_PATH(dir))).toBe(false)
  })

  it('adds an artifact with defaults and persists to the database', () => {
    const store = new ArtifactStore(dir)
    const artifact = store.add({ type: 'product', title: 'PRD', content: '# PRD body' })

    expect(artifact.id).toBeTruthy()
    expect(artifact.version).toBe(1)
    expect(artifact.source).toBe('import')
    expect(artifact.status).toBe('draft')
    expect(artifact.links).toEqual([])
    expect(artifact.checksum).toBe(checksum('# PRD body'))
    expect(existsSync(artifactDbPath(dir))).toBe(true)
    expect(existsSync(JSON_PATH(dir))).toBe(false)
  })

  it('persists artifacts across instances', () => {
    const store = new ArtifactStore(dir)
    store.add({ type: 'product', title: 'PRD', content: 'body' })

    const reloaded = new ArtifactStore(dir)
    expect(reloaded.list()).toHaveLength(1)
    expect(reloaded.list()[0].title).toBe('PRD')
  })

  it('finds artifacts by type', () => {
    const store = new ArtifactStore(dir)
    store.add({ type: 'product', title: 'PRD', content: 'a' })
    store.add({ type: 'requirements', title: 'Story', content: 'b' })

    expect(store.findByType('product')).toHaveLength(1)
    expect(store.findByType('requirements')[0].title).toBe('Story')
  })

  it('updates bump version and checksum', () => {
    const store = new ArtifactStore(dir)
    const artifact = store.add({ type: 'product', title: 'PRD', content: 'v1' })

    const updated = store.update(artifact.id, { content: 'v2' })
    expect(updated?.version).toBe(2)
    expect(updated?.checksum).toBe(checksum('v2'))
    expect(updated?.title).toBe('PRD')
  })

  it('returns null when updating a missing artifact', () => {
    const store = new ArtifactStore(dir)
    expect(store.update('nope', { content: 'x' })).toBeNull()
  })

  it('removes artifacts', () => {
    const store = new ArtifactStore(dir)
    const artifact = store.add({ type: 'product', title: 'PRD', content: 'a' })

    expect(store.remove(artifact.id)).toBe(true)
    expect(store.list()).toEqual([])
    expect(store.remove('nope')).toBe(false)
  })

  it('detects duplicate content via checksum', () => {
    const store = new ArtifactStore(dir)
    store.add({ type: 'product', title: 'PRD', content: 'same' })

    expect(store.hasChecksum(checksum('same'))).toBe(true)
    expect(store.hasChecksum(checksum('other'))).toBe(false)
  })

  it('links a parent artifact to a child artifact', () => {
    const store = new ArtifactStore(dir)
    const prd = store.add({ type: 'product', title: 'PRD', content: 'a' })
    const story = store.add({ type: 'requirements', title: 'Story', content: 'b' })

    expect(store.link(prd.id, story.id)).toBe(true)
    expect(store.get(prd.id)?.links).toEqual([story.id])
    expect(store.link('missing', story.id)).toBe(false)
  })

  it('supports custom source and status', () => {
    const store = new ArtifactStore(dir)
    const artifact = store.add({
      type: 'architecture',
      title: 'ADR-001',
      content: 'decision',
      source: 'generated',
      status: 'active',
    })
    expect(artifact.source).toBe('generated')
    expect(artifact.status).toBe('active')
  })

  it('round-trips meta through the database', () => {
    const store = new ArtifactStore(dir)
    const artifact = store.add({
      type: 'engineering',
      title: 'Review',
      content: 'body',
      meta: { platform: 'ios', kind: 'proactive-bundle-tip' },
    })
    expect(store.get(artifact.id)?.meta).toEqual({ platform: 'ios', kind: 'proactive-bundle-tip' })
  })

  it('isValidType still validates artifact types', () => {
    expect(ArtifactStore.isValidType('product')).toBe(true)
    expect(ArtifactStore.isValidType('nope')).toBe(false)
  })
})

describe('ArtifactStore forced JSON engine', () => {
  let dir: string

  beforeEach(() => {
    dir = createTempProject({})
  })

  afterEach(() => {
    cleanup(dir)
  })

  it('uses artifacts.json and never creates a file until an artifact is added', () => {
    const store = new ArtifactStore(dir, { engine: 'json' })
    expect(store.engine).toBe('json')
    expect(store.list()).toEqual([])
    expect(existsSync(JSON_PATH(dir))).toBe(false)

    store.add({ type: 'product', title: 'PRD', content: '# PRD body' })
    expect(existsSync(JSON_PATH(dir))).toBe(true)
  })

  it('persists across instances and supports the full interface', () => {
    const store = new ArtifactStore(dir, { engine: 'json' })
    const artifact = store.add({ type: 'product', title: 'PRD', content: 'login screen spec' })
    const story = store.add({ type: 'requirements', title: 'Story', content: 'password reset story' })
    store.link(artifact.id, story.id)

    const reloaded = new ArtifactStore(dir, { engine: 'json' })
    expect(reloaded.list()).toHaveLength(2)
    expect(reloaded.get(artifact.id)?.links).toEqual([story.id])
    expect(reloaded.fullTextSearch('story')).toHaveLength(1)
    expect(reloaded.vectorSearch('password reset')[0].artifact.title).toBe('Story')
  })

  it('query() throws a clear error on the JSON engine', () => {
    const store = new ArtifactStore(dir, { engine: 'json' })
    expect(() => store.query('SELECT * FROM artifacts')).toThrow(/SQLite engine/)
  })
})
