/**
 * PerfTools — MCP tools for Hermes runtime profiling
 * Business Source License 1.1 (BSL-1.1)
 *
 * Agents can analyze Hermes .cpuprofile / heap snapshot JSON (paste the file
 * contents as strings) and get deterministic findings: JS-thread blocking
 * events, retained objects, leak candidates. No model calls, no file writes.
 */

import { ToolRegistry } from './base'
import { mcpTool } from './decorators'
import { analyzeHermesRuntime } from '../../perf'
import type { PerfAnalysis, PerfFinding } from '../../perf'

/** Compact projection so agent-visible JSON stays small. */
function compact(analysis: PerfAnalysis): Record<string, unknown> {
  return {
    blockingEvents: analysis.cpu?.blockingEvents.slice(0, 10) ?? [],
    hotFunctions: analysis.cpu?.hotFunctions.slice(0, 10) ?? [],
    totalBlockingMs: analysis.cpu?.totalBlockingMs ?? null,
    topRetained: analysis.heap?.topRetained.slice(0, 10) ?? [],
    topSelf: analysis.heap?.topSelf.slice(0, 10) ?? [],
    totalHeapBytes: analysis.heap?.totalHeapBytes ?? null,
    findings: analysis.findings.map((f: PerfFinding) => ({
      category: f.category,
      severity: f.severity,
      target: f.target,
      file: f.file,
      metric: f.metric,
      message: f.message,
      suggestion: f.suggestion,
    })),
  }
}

const SCHEMA = {
  type: 'object',
  properties: {
    profileContent: { type: 'string', description: 'Hermes .cpuprofile JSON content (optional)' },
    heapContent: { type: 'string', description: 'Hermes .heapsnapshot JSON content (optional)' },
    thresholdMs: { type: 'number', description: 'JS-thread blocking threshold in ms (default 100)' },
  },
}

export class PerfTools extends ToolRegistry {
  @mcpTool(
    'analyze_hermes_profile',
    'Analyze a Hermes CPU profile and/or heap snapshot (paste the JSON contents): detects JS-thread blocking events (e.g. "useEffect blocks the JS thread for 500ms"), large retained objects, and leak candidates. Deterministic — no model calls, no file writes.',
    SCHEMA
  )
  async analyzeHermesProfileTool(args: Record<string, unknown>): Promise<string> {
    let cpuProfile: unknown
    if (typeof args.profileContent === 'string' && args.profileContent.trim()) {
      cpuProfile = JSON.parse(args.profileContent)
    }
    let heapSnapshot: unknown
    if (typeof args.heapContent === 'string' && args.heapContent.trim()) {
      heapSnapshot = JSON.parse(args.heapContent)
    }
    // MCP clients often send numbers as strings — accept both.
    const rawThreshold = args.thresholdMs
    const thresholdMs =
      typeof rawThreshold === 'number' && rawThreshold > 0
        ? rawThreshold
        : typeof rawThreshold === 'string' && Number(rawThreshold) > 0
          ? Number(rawThreshold)
          : undefined
    const analysis = analyzeHermesRuntime({ cpuProfile, heapSnapshot }, { blockingThresholdMs: thresholdMs })
    return JSON.stringify(compact(analysis), null, 2)
  }
}
