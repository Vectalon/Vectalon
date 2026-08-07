/**
 * vectalon profile — Hermes runtime analyzer
 * Business Source License 1.1 (BSL-1.1)
 *
 * Turns parsed CPU profiles + heap snapshots into actionable, code-review-ready
 * findings ("useEffect blocks the JS thread for 500ms — move to a worklet",
 * "this screen retains 42 MB — listeners never released"). Deterministic —
 * findings are derived from measured numbers, never from a model.
 */

import { analyzeCpuProfile } from './cpuprofile'
import { analyzeHeapSnapshot } from './heapsnapshot'
import type { PerfAnalysis, PerfAnalyzeOptions, PerfFinding } from './types'
import { formatBytes } from '../utils/bundleAnalyzer'

export interface HermesRuntimeInput {
  /** Raw parsed `.cpuprofile` document. */
  cpuProfile?: unknown
  /** Raw parsed `.heapsnapshot` document. */
  heapSnapshot?: unknown
}

/** Build a blocking finding whose message matches the code-review voice. */
function blockingFinding(event: { functionName: string; file: string | null; durationMs: number }, thresholdMs: number): PerfFinding {
  const fn = event.functionName === '(root)' ? 'the JS thread' : event.functionName
  return {
    category: 'blocking',
    severity: event.durationMs >= 1000 ? 'error' : 'warning',
    target: event.functionName,
    file: event.file,
    metric: `${event.durationMs}ms JS-thread block`,
    message: `${fn} blocks the JS thread for ${event.durationMs}ms (threshold ${thresholdMs}ms) — animations drop and gestures stall.`,
    suggestion: 'Move the work off the JS thread — a Reanimated worklet, a native module, or deferred/idle scheduling.',
  }
}

function retainedFinding(o: { name: string; type: string; retainedBytes: number }): PerfFinding {
  return {
    category: 'retained-size',
    severity: o.retainedBytes >= 32 * 1024 * 1024 ? 'error' : 'warning',
    target: o.name,
    file: null,
    metric: `${formatBytes(o.retainedBytes)} retained`,
    message: `${o.name} (${o.type}) retains ${formatBytes(o.retainedBytes)} on the heap — the app cannot reclaim it while this stays reachable.`,
    suggestion: 'Release references on unmount — clear timers, remove listeners/subscriptions, and null out caches and image buffers.',
  }
}

function leakFinding(o: { name: string; type: string; selfBytes: number }, thresholdBytes: number): PerfFinding {
  return {
    category: 'leak',
    severity: o.selfBytes >= thresholdBytes * 8 ? 'error' : 'warning',
    target: o.name,
    file: null,
    metric: `${formatBytes(o.selfBytes)} allocated`,
    message: `${o.name} (${o.type}) holds ${formatBytes(o.selfBytes)} of self allocation — a likely leak source if it accumulates across screens.`,
    suggestion: 'Check for repeated re-creation (per-render closures, growing caches, event listeners) and reuse or release the allocation.',
  }
}

/** Run the full analysis over whatever inputs are provided. */
export function analyzeHermesRuntime(input: HermesRuntimeInput, options: PerfAnalyzeOptions = {}): PerfAnalysis {
  const thresholdMs = options.blockingThresholdMs ?? 100
  const retainedThreshold = options.retainedThresholdBytes ?? 1024 * 1024
  const topN = options.topN ?? 10

  const cpu = input.cpuProfile !== undefined ? analyzeCpuProfile(input.cpuProfile, thresholdMs, topN) : null
  const heap = input.heapSnapshot !== undefined ? analyzeHeapSnapshot(input.heapSnapshot, topN) : null

  const findings: PerfFinding[] = []
  if (cpu) {
    for (const event of cpu.blockingEvents) {
      findings.push(blockingFinding(event, thresholdMs))
    }
    // A hot function that never crosses the run threshold is still useful info.
    const blocked = new Set(cpu.blockingEvents.map(e => e.functionName))
    for (const fn of cpu.hotFunctions) {
      if (blocked.has(fn.functionName)) continue
      if (fn.selfTimeMs < thresholdMs) break
      findings.push({
        category: 'blocking',
        severity: 'info',
        target: fn.functionName,
        file: fn.file,
        metric: `${fn.selfTimeMs}ms self time`,
        message: `${fn.functionName} spends ${fn.selfTimeMs}ms of JS-thread time total (${fn.samples} sample${fn.samples === 1 ? '' : 's'}).`,
        suggestion: 'Profile the body — heavy work here starves the JS thread even when it yields between samples.',
      })
    }
  }
  if (heap) {
    for (const o of heap.topRetained) {
      if (o.retainedBytes < retainedThreshold) break
      findings.push(retainedFinding(o))
    }
    for (const o of heap.topSelf) {
      if (o.selfBytes < retainedThreshold) break
      findings.push(leakFinding(o, retainedThreshold))
    }
  }

  return { cpu, heap, findings }
}

/** Human-readable markdown report for the CLI / docs. */
export function renderPerfReport(analysis: PerfAnalysis): string {
  const lines: string[] = []
  lines.push('## ⚡ Hermes runtime profile')
  lines.push('')

  if (analysis.cpu) {
    lines.push(`### CPU — ${analysis.cpu.totalTimeMs}ms profiled · ${analysis.cpu.totalSamples} samples`)
    lines.push('')
    if (analysis.cpu.blockingEvents.length > 0) {
      lines.push(`**${analysis.cpu.blockingEvents.length} JS-thread blocking event(s)** (total ${analysis.cpu.totalBlockingMs}ms):`)
      lines.push('')
      for (const e of analysis.cpu.blockingEvents.slice(0, 5)) {
        const loc = e.file ? ` (${e.file}${e.line ? `:${e.line}` : ''})` : ''
        lines.push(`- 🔴 \`${e.functionName}\`${loc} — ${e.durationMs}ms block at ${e.startMs}ms`)
      }
      lines.push('')
    } else {
      lines.push('No JS-thread blocking events over the threshold.')
      lines.push('')
    }
    if (analysis.cpu.hotFunctions.length > 0) {
      lines.push('Hot functions by self time:')
      for (const fn of analysis.cpu.hotFunctions.slice(0, 5)) {
        lines.push(`- \`${fn.functionName}\` — ${fn.selfTimeMs}ms (${fn.samples} samples)`)
      }
      lines.push('')
    }
  }

  if (analysis.heap) {
    lines.push(`### Heap — ${formatBytes(analysis.heap.totalHeapBytes)} total · ${analysis.heap.nodeCount} nodes`)
    lines.push('')
    if (analysis.heap.topRetained.length > 0) {
      lines.push('Largest retained objects:')
      for (const o of analysis.heap.topRetained.slice(0, 5)) {
        lines.push(`- 🧠 \`${o.name}\` (${o.type}) — ${formatBytes(o.retainedBytes)} retained`)
      }
      lines.push('')
    }
    if (analysis.heap.topSelf.length > 0) {
      lines.push('Largest allocations (leak candidates):')
      for (const o of analysis.heap.topSelf.slice(0, 5)) {
        lines.push(`- \`${o.name}\` (${o.type}) — ${formatBytes(o.selfBytes)}`)
      }
      lines.push('')
    }
  }

  if (analysis.findings.length === 0) {
    lines.push('No runtime findings — profile is healthy.')
    lines.push('')
  }
  return lines.join('\n')
}
