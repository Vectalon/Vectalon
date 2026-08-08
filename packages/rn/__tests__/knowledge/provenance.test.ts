import {
  SOURCE_CONFIDENCE,
  STATUS_CONFIDENCE,
  stalenessDate,
  recencyFactor,
  computeConfidence,
  artifactProvenance,
  confidenceFactor,
  rankByConfidence,
  patternProvenance,
} from '../../src/knowledge/provenance'
import { KnowledgeIndex } from '../../src/knowledge/KnowledgeIndex'
import { ArtifactStore } from '../../src/knowledge/ArtifactStore'
import { ProjectMemory } from '../../src/memory/ProjectMemory'
import { createTempProject, cleanup } from '../helpers/tmp'
import type { Artifact } from '../../src/knowledge/artifactTypes'

function artifact(overrides: Partial<Artifact> = {}): Artifact {
  return {
    id: 'a1',
    type: 'product',
    title: 'PRD',
    content: 'body',
    source: 'import',
    status: 'draft',
    createdAt: 1,
    updatedAt: 1,
    version: 1,
    meta: {},
    links: [],
    checksum: 'c',
    history: [],
    ...overrides,
  }
}

const NOW = 1_000_000_000_000

describe('provenance confidence scoring', () => {
  it('scores sources by trust: generated > user > import > daemon', () => {
    expect(SOURCE_CONFIDENCE.generated).toBeGreaterThan(SOURCE_CONFIDENCE.user)
    expect(SOURCE_CONFIDENCE.user).toBeGreaterThan(SOURCE_CONFIDENCE.import)
    expect(SOURCE_CONFIDENCE.import).toBeGreaterThan(SOURCE_CONFIDENCE.daemon)
  })

  it('scores status: active > draft > deprecated', () => {
    expect(STATUS_CONFIDENCE.active).toBeGreaterThan(STATUS_CONFIDENCE.draft)
    expect(STATUS_CONFIDENCE.draft).toBeGreaterThan(STATUS_CONFIDENCE.deprecated)
  })

  it('computes staleness date as updatedAt + TTL', () => {
    expect(stalenessDate(artifact({ updatedAt: 1000 }), 90)).toBe(1000 + 90 * 24 * 3600_000)
  })

  it('recency factor is 1 while fresh and decays toward the floor after staleness', () => {
    const fresh = artifact({ updatedAt: NOW })
    expect(recencyFactor(fresh, { now: NOW })).toBe(1)
    expect(recencyFactor(fresh, { now: NOW + 90 * 24 * 3600_000 })).toBe(1)

    // One TTL past the staleness date → one half-life → 0.5.
    expect(recencyFactor(fresh, { now: NOW + 2 * 90 * 24 * 3600_000 })).toBeCloseTo(0.5, 3)
    // A very old artifact floors at 0.25 by default.
    expect(recencyFactor(fresh, { now: NOW + 100 * 90 * 24 * 3600_000 })).toBeCloseTo(0.25, 3)
  })

  it('combines source × status × recency into a 0..1 confidence', () => {
    const now = NOW
    const fresh = artifact({ source: 'generated', status: 'active', updatedAt: now })
    expect(computeConfidence(fresh, { now })).toBeCloseTo(1.0, 3)

    const imported = artifact({ source: 'import', status: 'draft', updatedAt: now })
    // 0.75 × 0.8 × 1 = 0.6
    expect(computeConfidence(imported, { now })).toBeCloseTo(0.6, 3)

    const deprecated = artifact({ source: 'import', status: 'deprecated', updatedAt: now })
    // 0.75 × 0.4 = 0.3
    expect(computeConfidence(deprecated, { now })).toBeCloseTo(0.3, 3)

    // updatedAt is 3 TTLs ago → staleness date 2 TTLs ago → 2 half-lives → × 0.25
    const stale = artifact({ source: 'generated', status: 'active', updatedAt: now - 3 * 90 * 24 * 3600_000 })
    expect(computeConfidence(stale, { now })).toBeCloseTo(0.25, 3)
  })

  it('builds a full provenance record', () => {
    const p = artifactProvenance(artifact({ source: 'user', status: 'active', updatedAt: 5 }), { now: 5 })
    expect(p.source).toBe('user')
    expect(p.confidence).toBeCloseTo(0.9, 3)
    expect(p.stalenessDate).toBe(5 + 90 * 24 * 3600_000)
    expect(p.refreshedAt).toBe(5)
  })

  it('confidenceFactor maps 0..1 confidence to a bounded retrieval multiplier', () => {
    expect(confidenceFactor(1)).toBe(1)
    expect(confidenceFactor(0)).toBeCloseTo(0.4, 3)
    expect(confidenceFactor(0.5)).toBeCloseTo(0.7, 3)
  })

  it('rankByConfidence re-ranks by score × confidence, then recency', () => {
    const now = NOW
    const results = [
      { artifact: artifact({ id: 'stale', source: 'import', status: 'draft', updatedAt: now - 10 * 90 * 24 * 3600_000 }), score: 5 },
      { artifact: artifact({ id: 'fresh', source: 'generated', status: 'active', updatedAt: now }), score: 4 },
      { artifact: artifact({ id: 'medium', source: 'user', status: 'active', updatedAt: now }), score: 3 },
    ]
    const ranked = rankByConfidence(results, { now })
    expect(ranked[0].artifact.id).toBe('fresh')
    expect(ranked[1].artifact.id).toBe('medium')
    expect(ranked[2].artifact.id).toBe('stale')
    // Confidence ordering on the top two: generated(1.0) > user(0.9).
    expect(ranked[0].confidence).toBeGreaterThan(ranked[1].confidence)
    // The stale doc has a heavily decayed confidence.
    expect(ranked[2].confidence).toBeLessThan(0.5)
    expect(ranked[0].rankedScore).toBeCloseTo(4, 3)
  })
})

describe('pattern provenance', () => {
  it('decays learner confidence with staleness', () => {
    const now = NOW
    const fresh = patternProvenance({ source: 'learner', lastSeen: now, confidence: 0.9 }, { now })
    expect(fresh.confidence).toBeCloseTo(0.9 * 0.7, 3)
    expect(fresh.source).toBe('learner')

    // 3 TTLs ago → staleness 2 TTLs ago → 2 half-lives → × 0.25
    const stale = patternProvenance(
      { source: 'learner', lastSeen: now - 3 * 90 * 24 * 3600_000, confidence: 0.9 },
      { now }
    )
    expect(stale.confidence).toBeLessThan(fresh.confidence)
    // Rounded to 3 decimals: 0.1575 → 0.158.
    expect(stale.confidence).toBeCloseTo(0.158, 3)
  })

  it('manual patterns out-trust web and learner ones', () => {
    const now = NOW
    const manual = patternProvenance({ source: 'manual', lastSeen: now, confidence: 0.8 }, { now })
    const web = patternProvenance({ source: 'web', lastSeen: now, confidence: 0.8 }, { now })
    const learner = patternProvenance({ source: 'learner', lastSeen: now, confidence: 0.8 }, { now })
    expect(manual.confidence).toBeGreaterThan(web.confidence)
    expect(web.confidence).toBeGreaterThan(learner.confidence)
  })
})

describe('pattern provenance persistence', () => {
  it('survives a ProjectMemory save/load round-trip through memory.json', () => {
    const dir = createTempProject({})
    try {
      const memory = new ProjectMemory(dir)
      memory.addPattern({
        id: 'naming-pascal',
        pattern: 'PascalCase components',
        description: 'Uses PascalCase naming',
        confidence: 0.9,
        occurrences: 3,
        firstSeen: 1,
        lastSeen: 1,
        category: 'naming',
        source: 'learner',
      })
      // Reload from disk — provenance must not be dropped.
      const reloaded = new ProjectMemory(dir)
      const restored = reloaded.getActivePatterns().find(p => p.id === 'naming-pascal')
      expect(restored?.source).toBe('learner')
      expect(restored?.confidence).toBe(0.9)
    } finally {
      cleanup(dir)
    }
  })
})

describe('KnowledgeIndex confidence ranking', () => {
  let dir: string
  let store: ArtifactStore

  beforeEach(() => {
    dir = createTempProject({})
    store = new ArtifactStore(dir, { engine: 'json' })
  })

  afterEach(() => {
    store.close()
    cleanup(dir)
  })

  it('prefers a fresh high-confidence doc over a stale one with equal relevance', () => {
    const index = new KnowledgeIndex()
    const now = Date.now()
    const stale = store.add({
      type: 'product',
      title: 'Retention Strategy',
      content: 'cohort growth tactics',
      meta: { testUpdatedAt: String(now - 400 * 24 * 3600_000) },
    })
    // Simulate an old artifact by patching updatedAt through the store's own
    // persistence: add both, then read with a forced old timestamp.
    const fresh = store.add({
      type: 'product',
      title: 'Retention Strategy',
      content: 'cohort growth tactics',
      source: 'generated',
      status: 'active',
    })
    const staleWithOldDate: Artifact = { ...stale, updatedAt: now - 400 * 24 * 3600_000, status: 'deprecated' }
    const freshActive: Artifact = { ...fresh, updatedAt: now }

    index.add({ artifact: staleWithOldDate, project: 'a' })
    index.add({ artifact: freshActive, project: 'b' })

    const results = index.search('retention')
    expect(results).toHaveLength(2)
    expect(results[0].artifact.id).toBe(fresh.id)
    expect(results[0].confidence).toBeGreaterThan(results[1].confidence)
    expect(results[0].rankedScore).toBeGreaterThan(results[1].rankedScore)
    // Provenance surfaces the staleness date.
    expect(results[0].provenance.stalenessDate).toBeGreaterThan(results[1].provenance.stalenessDate)
  })

  it('keeps pure relevance ranking when confidence is equal', () => {
    const index = new KnowledgeIndex()
    const titled = store.add({ type: 'product', title: 'Retention Strategy', content: 'growth work' })
    const contented = store.add({ type: 'product', title: 'Roadmap', content: 'retention is our north star' })
    index.add({ artifact: { ...titled, updatedAt: Date.now() } })
    index.add({ artifact: { ...contented, updatedAt: Date.now() } })

    const results = index.search('retention')
    expect(results[0].artifact.id).toBe(titled.id)
    expect(results[0].lexicalScore).toBeGreaterThan(results[1].lexicalScore)
  })
})
