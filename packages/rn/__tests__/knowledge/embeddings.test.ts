import { cosineSimilarity, HashEmbeddingProvider } from '../../src/knowledge/embeddings'

describe('embeddings', () => {
  it('computes cosine similarity of identical and orthogonal vectors', () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBeCloseTo(1)
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0)
    expect(cosineSimilarity([1, 1], [1, 1])).toBeCloseTo(1)
  })

  it('returns zero for empty or zero-magnitude vectors', () => {
    expect(cosineSimilarity([], [])).toBe(0)
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0)
  })

  it('returns the cosine of the angle between non-identical vectors', () => {
    const result = cosineSimilarity([1, 1], [2, 0])
    expect(result).toBeCloseTo(Math.SQRT1_2)
  })

  it('HashEmbeddingProvider is deterministic for the same text', () => {
    const provider = new HashEmbeddingProvider()
    expect(provider.embed('camera onboarding')).toEqual(provider.embed('camera onboarding'))
    expect(provider.name).toBe('hash')
  })

  it('HashEmbeddingProvider produces fixed-length vectors and differs across texts', () => {
    const provider = new HashEmbeddingProvider()
    const a = provider.embed('payment gateway')
    const b = provider.embed('retention metric')
    expect(a).toHaveLength(64)
    expect(b).toHaveLength(64)
    expect(cosineSimilarity(a, b)).toBeLessThan(1)
  })

  it('HashEmbeddingProvider yields higher similarity for texts sharing a bigram profile', () => {
    const provider = new HashEmbeddingProvider()
    const close = cosineSimilarity(provider.embed('the payment service is down'), provider.embed('payment service outage'))
    const far = cosineSimilarity(provider.embed('the payment service is down'), provider.embed('weekly retention trends report'))
    expect(close).toBeGreaterThan(far)
  })
})
