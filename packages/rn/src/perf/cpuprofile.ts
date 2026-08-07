/**
 * vectalon profile — Hermes .cpuprofile parser
 * Business Source License 1.1 (BSL-1.1)
 *
 * Parses Hermes CPU profiles (Chrome DevTools `.cpuprofile` JSON — the format
 * Hermes emits via `HermesRuntime`'s sampling profiler) and computes:
 *
 * - **JS-thread blocking events**: contiguous sample runs where the JS thread
 *   stayed in the same frame. A run longer than the threshold is a blocking
 *   event (the JS thread could not yield — animations dropped, gestures
 *   missed). This is what produces "This useEffect blocks the JS thread for
 *   500ms — move to a worklet".
 * - **Hot functions**: total self time per function (where the time actually
 *   went), ranked.
 *
 * Deterministic, no subprocesses, no model calls.
 */

import type { BlockingEvent, CpuProfileStats, PerfFunctionInfo } from './types'

/** A node from the profile's flat `nodes` array. */
interface ProfileNode {
  id: number
  functionName: string
  url: string | null
  lineNumber: number | null
  hitCount: number
}

interface ParsedProfile {
  nodes: Map<number, ProfileNode>
  samples: number[]
  /** Microseconds per sample (aligned with `samples`). */
  timeDeltas: number[]
  totalTimeMs: number
}

/** Normalize a script URL: strip `file://`, keep the trailing path. */
export function normalizeScriptUrl(url: string | null | undefined): string | null {
  if (!url) return null
  let u = url
  if (u.startsWith('file://')) u = u.slice('file://'.length)
  if (u.startsWith('http://') || u.startsWith('https://')) {
    try {
      u = new URL(u).pathname
    } catch {
      // keep as-is
    }
  }
  // Hermes often reports `metro://...` bundles — keep the module path.
  return u || null
}

/**
 * Parse a Hermes/Chrome `.cpuprofile` JSON document. Returns null (never
 * throws) when the document is not a usable CPU profile. Supports both the
 * modern flat layout (`nodes` + `samples` + `timeDeltas`) and the older
 * `head`-tree layout (falls back to hitCount ratios × total duration).
 */
export function parseCpuProfile(raw: unknown): ParsedProfile | null {
  if (!raw || typeof raw !== 'object') return null
  const doc = raw as Record<string, unknown>
  const nodesRaw = Array.isArray(doc.nodes) ? (doc.nodes as Record<string, unknown>[]) : []
  const start = Number(doc.startTime ?? 0)
  const end = Number(doc.endTime ?? 0)
  const totalMs = end > start ? (end - start) / 1000 : 0

  const nodes = new Map<number, ProfileNode>()
  for (const n of nodesRaw) {
    const id = Number(n.id)
    if (!Number.isFinite(id)) continue
    const frame = (n.callFrame as Record<string, unknown> | undefined) || {}
    nodes.set(id, {
      id,
      functionName: typeof frame.functionName === 'string' ? frame.functionName : '(anonymous)',
      url: normalizeScriptUrl(typeof frame.url === 'string' ? frame.url : null),
      lineNumber: Number.isFinite(Number(frame.lineNumber)) ? Number(frame.lineNumber) : null,
      hitCount: Number(n.hitCount) || 0,
    })
  }

  const samples = Array.isArray(doc.samples) ? (doc.samples as unknown[]).map(Number) : []
  const timeDeltas = Array.isArray(doc.timeDeltas) ? (doc.timeDeltas as unknown[]).map(Number) : []

  if (samples.length > 0) {
    return { nodes, samples, timeDeltas, totalTimeMs: totalMs }
  }

  // Fallback: `head`-tree layout. Distribute total time by hitCount ratio.
  const totalHits = [...nodes.values()].reduce((acc, n) => acc + n.hitCount, 0)
  if (totalHits <= 0 || totalMs <= 0) return null
  const synthesized: number[] = []
  const deltas: number[] = []
  for (const n of nodes.values()) {
    const msPerSample = n.hitCount > 0 ? (totalMs * n.hitCount) / totalHits : 0
    if (n.hitCount > 0) {
      synthesized.push(n.id)
      deltas.push(msPerSample * 1000)
    }
  }
  return { nodes, samples: synthesized, timeDeltas: deltas, totalTimeMs: totalMs }
}

/** Compute self time per node id from samples + timeDeltas (µs → ms). */
function selfTimeByNode(profile: ParsedProfile): Map<number, number> {
  const acc = new Map<number, number>()
  const { samples, timeDeltas } = profile
  for (let i = 0; i < samples.length; i++) {
    const id = samples[i]
    const deltaUs = i < timeDeltas.length ? timeDeltas[i] : 0
    acc.set(id, (acc.get(id) || 0) + deltaUs / 1000)
  }
  return acc
}

/**
 * Find contiguous runs where the JS thread stayed in one frame and each run
 * exceeds `thresholdMs`. Returns the runs sorted by duration (descending).
 */
export function findBlockingEvents(
  profile: ParsedProfile,
  thresholdMs: number
): BlockingEvent[] {
  const { samples, timeDeltas } = profile
  const events: BlockingEvent[] = []
  let runId = samples[0] ?? -1
  let runTimeUs = 0
  let elapsedUs = 0 // running accumulator — keeps this O(n)

  const flush = (): void => {
    if (runTimeUs / 1000 >= thresholdMs && runId !== -1) {
      const node = profile.nodes.get(runId)
      events.push({
        functionName: node?.functionName ?? '(unknown)',
        file: node?.url ?? null,
        line: node?.lineNumber ?? null,
        durationMs: Math.round((runTimeUs / 1000) * 10) / 10,
        // The run started at (elapsed before this run) = elapsedUs - runTimeUs.
        startMs: Math.round(((elapsedUs - runTimeUs) / 1000) * 10) / 10,
      })
    }
  }

  for (let i = 0; i < samples.length; i++) {
    const id = samples[i]
    const deltaUs = i < timeDeltas.length ? timeDeltas[i] : 0
    if (id !== runId) {
      flush()
      runId = id
      runTimeUs = 0
    }
    runTimeUs += deltaUs
    elapsedUs += deltaUs
  }
  flush()

  return events.sort((a, b) => b.durationMs - a.durationMs)
}

/** Aggregate self time into a ranked list of hot functions (top `limit`). */
export function hotFunctions(profile: ParsedProfile, limit: number): PerfFunctionInfo[] {
  const self = selfTimeByNode(profile)
  // Count how many samples landed on each node (for the sample column).
  const sampleCount = new Map<number, number>()
  for (const id of profile.samples) {
    sampleCount.set(id, (sampleCount.get(id) || 0) + 1)
  }
  const merged = new Map<string, PerfFunctionInfo>()
  for (const [id, ms] of self) {
    const node = profile.nodes.get(id)
    if (!node) continue
    const key = `${node.functionName}|${node.url ?? ''}|${node.lineNumber ?? ''}`
    const existing = merged.get(key)
    if (existing) {
      existing.selfTimeMs = Math.round((existing.selfTimeMs + ms) * 10) / 10
      existing.samples += sampleCount.get(id) || 0
    } else {
      merged.set(key, {
        functionName: node.functionName,
        file: node.url,
        line: node.lineNumber,
        selfTimeMs: Math.round(ms * 10) / 10,
        samples: sampleCount.get(id) || 0,
      })
    }
  }
  return [...merged.values()].sort((a, b) => b.selfTimeMs - a.selfTimeMs).slice(0, limit)
}

/** Full CPU-profile stats: blocking events + hot functions + totals. */
export function analyzeCpuProfile(raw: unknown, thresholdMs = 100, topN = 10): CpuProfileStats | null {
  const profile = parseCpuProfile(raw)
  if (!profile) return null
  const blockingEvents = findBlockingEvents(profile, thresholdMs)
  return {
    totalSamples: profile.samples.length,
    totalTimeMs: Math.round(profile.totalTimeMs * 10) / 10,
    hotFunctions: hotFunctions(profile, topN),
    blockingEvents,
    totalBlockingMs: Math.round(blockingEvents.reduce((a, e) => a + e.durationMs, 0) * 10) / 10,
  }
}
