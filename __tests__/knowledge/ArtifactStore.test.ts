import { existsSync } from 'fs'
import { join } from 'path'
import { ArtifactStore } from '../../src/knowledge/ArtifactStore'
import { checksum } from '../../src/knowledge/artifactTypes'
import { createTempProject, cleanup } from '../helpers/tmp'

describe('ArtifactStore', () => {
  let dir: string

  beforeEach(() => {
    dir = createTempProject({})
  })

  afterEach(() => {
    cleanup(dir)
  })

  it('starts empty and does not create a file until an artifact is added', () => {
    const store = new ArtifactStore(dir)
    expect(store.list()).toEqual([])
    expect(existsSync(join(dir, '.vectalon', 'knowledge', 'artifacts.json'))).toBe(false)
  })

  it('adds an artifact with defaults and persists to .vectalon/knowledge/artifacts.json', () => {
    const store = new ArtifactStore(dir)
    const artifact = store.add({ type: 'product', title: 'PRD', content: '# PRD body' })

    expect(artifact.id).toBeTruthy()
    expect(artifact.version).toBe(1)
    expect(artifact.source).toBe('import')
    expect(artifact.status).toBe('draft')
    expect(artifact.links).toEqual([])
    expect(artifact.checksum).toBe(checksum('# PRD body'))
    expect(existsSync(join(dir, '.vectalon', 'knowledge', 'artifacts.json'))).toBe(true)
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
})
