import { createHash } from 'crypto'

/** Canonical JSON for benchmark inputs: object key order is irrelevant; array order is not. */
export function benchmarkFingerprint(value: unknown): string {
  const canonical = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(canonical)
    if (input !== null && typeof input === 'object') {
      return Object.fromEntries(Object.entries(input).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
        .map(([key, item]) => [key, canonical(item)]))
    }
    return input
  }
  return `sha256:${createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex')}`
}
