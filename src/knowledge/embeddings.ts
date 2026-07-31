export interface EmbeddingProvider {
  readonly name: string
  embed(text: string): number[]
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0
  let dot = 0
  let magA = 0
  let magB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    magA += a[i] * a[i]
    magB += b[i] * b[i]
  }
  if (magA === 0 || magB === 0) return 0
  return dot / (Math.sqrt(magA) * Math.sqrt(magB))
}

const DIMENSIONS = 64

export class HashEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'hash'

  embed(text: string): number[] {
    const vector = new Array<number>(DIMENSIONS).fill(0)
    const normalized = text.toLowerCase()
    for (let i = 0; i < normalized.length - 1; i++) {
      const bigram = normalized.slice(i, i + 2)
      let hash = 0
      for (let j = 0; j < bigram.length; j++) {
        hash = (hash * 31 + bigram.charCodeAt(j)) >>> 0
      }
      vector[hash % DIMENSIONS]++
    }
    return vector
  }
}
