import { mkdirSync } from 'fs'
import { join } from 'path'
import { MetroEventHandler } from '../../src/daemon/metroEvents'
import { ArtifactStore } from '../../src/knowledge/ArtifactStore'
import type { MetroEvent } from '../../src/daemon/types'
import { createTempProject, cleanup } from '../helpers/tmp'

function moduleEntry(name: string, size: number, sourcePath?: string) {
  return { name, size, sourcePath: sourcePath || `/proj/node_modules/${name.replace('node_modules/', '')}` }
}

describe('MetroEventHandler', () => {
  let dir: string

  beforeEach(() => {
    dir = createTempProject({})
    mkdirSync(join(dir, '.vectalon'), { recursive: true })
  })

  afterEach(() => {
    cleanup(dir)
  })

  it('records a bundle snapshot and surfaces a proactive tip on growth', () => {
    const store = new ArtifactStore(dir)
    const handler = new MetroEventHandler(store)

    // First build: baseline only.
    handler.handle({
      type: 'bundle_build_done',
      platform: 'ios',
      bundleStats: { modules: [moduleEntry('react-native/index.js', 500)] },
    })

    // Second build adds lodash (+80 KB).
    const result = handler.handle({
      type: 'bundle_build_done',
      platform: 'ios',
      bundleStats: {
        modules: [
          moduleEntry('react-native/index.js', 500),
          moduleEntry('lodash/index.js', 80 * 1024),
        ],
      },
    })

    expect(result.kind).toBe('bundle_done')
    expect(result.delta?.pct).toBeGreaterThan(0)
    expect(result.insights.some(insight => insight.includes('lodash'))).toBe(true)

    const artifacts = store.list()
    expect(artifacts.some(a => a.title.startsWith('Bundle size snapshot'))).toBe(true)
    expect(artifacts.some(a => a.title.startsWith('Proactive bundle insight'))).toBe(true)
    expect(artifacts.every(a => a.source === 'daemon' || a.source === 'generated')).toBe(true)
  })

  it('records build errors as engineering artifacts, deduped by content', () => {
    const store = new ArtifactStore(dir)
    const handler = new MetroEventHandler(store)

    const event: MetroEvent = {
      type: 'bundle_build_failed',
      platform: 'android',
      error: 'SyntaxError: Unexpected token',
    }

    const first = handler.handle(event)
    const second = handler.handle(event)

    expect(first.kind).toBe('bundle_failed')
    expect(first.insights[0]).toContain('SyntaxError')
    // Identical failure text is stored once.
    expect(store.list().filter(a => a.title.startsWith('Metro build error')).length).toBe(1)
    expect(second.artifacts).toEqual([])
  })

  it('ignores unknown events', () => {
    const store = new ArtifactStore(dir)
    const handler = new MetroEventHandler(store)

    const result = handler.handle({ type: 'transform_cache_reset' } as unknown as MetroEvent)

    expect(result.kind).toBe('ignored')
    expect(store.list()).toHaveLength(0)
  })

  it('counts handled events for /status', () => {
    const handler = new MetroEventHandler(new ArtifactStore(dir))
    handler.handle({ type: 'bundle_build_failed', platform: 'ios', error: 'x' })
    handler.handle({ type: 'bundle_build_failed', platform: 'ios', error: 'x' })
    expect(handler.getEventCount()).toBe(2)
  })
})
