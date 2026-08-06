import { ArtifactStore } from '../../src/knowledge/ArtifactStore'
import { Traceability } from '../../src/knowledge/Traceability'
import { createTempProject, cleanup } from '../helpers/tmp'

describe('Traceability', () => {
  let dir: string
  let store: ArtifactStore

  beforeEach(() => {
    dir = createTempProject({})
    store = new ArtifactStore(dir)
  })

  afterEach(() => {
    cleanup(dir)
  })

  function seedChain() {
    const prd = store.add({ type: 'product', title: 'PRD', content: 'a' })
    const story = store.add({ type: 'requirements', title: 'Story', content: 'b' })
    const task = store.add({ type: 'requirements', title: 'Task', content: 'c' })
    store.link(prd.id, story.id)
    store.link(story.id, task.id)
    return { prd, story, task }
  }

  it('returns directly linked artifacts in both directions', () => {
    const { prd, story, task } = seedChain()
    const trace = new Traceability(store)

    expect(trace.getLinked(prd.id).map(a => a.id)).toEqual([story.id])
    expect(trace.getLinked(task.id).map(a => a.id)).toEqual([story.id])
    expect(trace.getLinked(story.id).map(a => a.id).sort()).toEqual([prd.id, task.id].sort())
  })

  it('traces forward through the link graph', () => {
    const { prd, story, task } = seedChain()
    const forward = new Traceability(store).traceForward(prd.id)
    const ids = forward.map(a => a.id)
    expect(ids).toContain(story.id)
    expect(ids).toContain(task.id)
  })

  it('traces backward through the link graph', () => {
    const { prd, story, task } = seedChain()
    const backward = new Traceability(store).traceBackward(task.id)
    const ids = backward.map(a => a.id)
    expect(ids).toContain(story.id)
    expect(ids).toContain(prd.id)
  })

  it('terminates on cyclic links', () => {
    const a = store.add({ type: 'product', title: 'A', content: 'a' })
    const b = store.add({ type: 'product', title: 'B', content: 'b' })
    store.link(a.id, b.id)
    store.link(b.id, a.id)

    const forward = new Traceability(store).traceForward(a.id)
    const ids = forward.map(x => x.id)
    expect(ids).toContain(b.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('returns empty for unknown artifacts', () => {
    const trace = new Traceability(store)
    expect(trace.traceForward('missing')).toEqual([])
    expect(trace.traceBackward('missing')).toEqual([])
  })
})
