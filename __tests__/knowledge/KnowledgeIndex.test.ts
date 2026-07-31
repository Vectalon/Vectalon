import { ArtifactStore } from '../../src/knowledge/ArtifactStore'
import { KnowledgeIndex } from '../../src/knowledge/KnowledgeIndex'
import { HashEmbeddingProvider } from '../../src/knowledge/embeddings'
import type { Artifact } from '../../src/knowledge/artifactTypes'
import { createTempProject, cleanup } from '../helpers/tmp'

const tempDirs: string[] = []

function artifacts(specs: Array<{ type: string; title: string; content: string }>): Artifact[] {
  const dir = createTempProject({})
  tempDirs.push(dir)
  const store = new ArtifactStore(dir)
  return specs.map(s => store.add({ type: s.type as never, title: s.title, content: s.content }))
}

describe('KnowledgeIndex', () => {
  afterEach(() => {
    for (const dir of tempDirs) cleanup(dir)
    tempDirs.length = 0
  })

  it('indexes documents and ranks title matches above content matches', () => {
    const index = new KnowledgeIndex()
    const [titled, contented] = artifacts([
      { type: 'product', title: 'Retention Strategy', content: 'growth work' },
      { type: 'product', title: 'Roadmap', content: 'retention is our north star' },
    ])
    index.add({ artifact: titled, project: 'a' })
    index.add({ artifact: contented, project: 'b' })

    const results = index.search('retention')
    expect(results).toHaveLength(2)
    expect(results[0].artifact.id).toBe(titled.id)
    expect(results[0].lexicalScore).toBeGreaterThan(results[1].lexicalScore)
    expect(results[0].project).toBe('a')
    expect(results[0].semanticScore).toBeNull()
  })

  it('scores documents matching more query terms higher', () => {
    const index = new KnowledgeIndex()
    const [few, many] = artifacts([
      { type: 'product', title: 'Camera', content: 'Onboarding flow.' },
      { type: 'product', title: 'Camera Onboarding', content: 'Camera onboarding flow for users.' },
    ])
    index.add({ artifact: few })
    index.add({ artifact: many })

    const results = index.search('camera onboarding')
    expect(results[0].artifact.id).toBe(many.id)
  })

  it('filters by team, project, and type', () => {
    const index = new KnowledgeIndex()
    const [prd, runbook] = artifacts([
      { type: 'product', title: 'PRD', content: 'camera onboarding for mobile users' },
      { type: 'operations', title: 'Runbook', content: 'restart the payment service on outage' },
    ])
    index.add({ artifact: prd, project: 'app', team: 'mobile' })
    index.add({ artifact: runbook, project: 'payments', team: 'backend' })

    expect(index.search('camera', { team: 'mobile' })).toHaveLength(1)
    expect(index.search('camera', { project: 'payments' })).toHaveLength(0)
    expect(index.search('payment', { type: 'operations' })[0].artifact.id).toBe(runbook.id)
  })

  it('returns nothing for empty queries and respects the limit', () => {
    const index = new KnowledgeIndex()
    const [a, b] = artifacts([
      { type: 'product', title: 'Camera', content: 'onboarding' },
      { type: 'product', title: 'Payments', content: 'checkout' },
    ])
    index.add({ artifact: a })
    index.add({ artifact: b })

    expect(index.search('')).toEqual([])
    expect(index.search('onboarding', { limit: 0 })).toEqual([])
    expect(index.search('onboarding camera', { limit: 1 })).toHaveLength(1)
  })

  it('removes documents from the index', () => {
    const index = new KnowledgeIndex()
    const [a, b] = artifacts([
      { type: 'product', title: 'Camera', content: 'onboarding' },
      { type: 'product', title: 'Retention', content: 'cohort' },
    ])
    index.add({ artifact: a })
    index.add({ artifact: b })
    expect(index.size()).toBe(2)

    expect(index.remove(a.id)).toBe(true)
    expect(index.size()).toBe(1)
    expect(index.search('onboarding')).toEqual([])
    expect(index.remove(a.id)).toBe(false)
  })

  it('merges semantic scores when an embedding provider is attached', () => {
    const index = new KnowledgeIndex(new HashEmbeddingProvider(), 0.5)
    const [a] = artifacts([
      { type: 'product', title: 'Weekly Report', content: 'cohort and billing payment analysis' },
    ])
    index.add({ artifact: a, project: 'app' })

    const results = index.search('payment service outage')
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].semanticScore).not.toBeNull()
    expect(results[0].semanticScore as number).toBeGreaterThan(0)
    expect(results[0].score).toBeGreaterThan(0)
  })

  it('combines normalized lexical and semantic scores', () => {
    const index = new KnowledgeIndex(new HashEmbeddingProvider(), 0.5)
    const [one, two] = artifacts([
      { type: 'product', title: 'Payment Gateway', content: 'Use Stripe for checkout.' },
      { type: 'analytics', title: 'Retention', content: 'weekly cohort trends.' },
    ])
    index.add({ artifact: one })
    index.add({ artifact: two })

    const results = index.search('payment')
    expect(results).toHaveLength(2)
    expect(results[0].artifact.id).toBe(one.id)
    expect(results[0].score).toBeLessThanOrEqual(1.5)
  })
})
