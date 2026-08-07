/**
 * vectalon profile — Hermes runtime profiling types
 * Business Source License 1.1 (BSL-1.1)
 *
 * Shared shapes for parsing Hermes .cpuprofile / heap snapshots, turning them
 * into actionable findings (JS-thread blocking, large retained objects, leak
 * signals), storing baselines in the knowledge base, and flagging regressions.
 */

export type PerfFindingCategory = 'blocking' | 'retained-size' | 'leak' | 'regression'

export type PerfSeverity = 'error' | 'warning' | 'info'

/** A function with measured self (exclusive) time from a CPU profile. */
export interface PerfFunctionInfo {
  functionName: string
  /** Script URL with any `file://` prefix stripped; null when unknown. */
  file: string | null
  line: number | null
  selfTimeMs: number
  /** Number of samples attributed to this function. */
  samples: number
}

/** A contiguous run of samples where the JS thread stayed in one frame. */
export interface BlockingEvent {
  functionName: string
  file: string | null
  line: number | null
  /** Wall-clock duration of the blocking run in milliseconds. */
  durationMs: number
  /** Start time within the profile in milliseconds. */
  startMs: number
}

/** One actionable runtime finding (maps 1:1 to code-review evidence). */
export interface PerfFinding {
  category: PerfFindingCategory
  severity: PerfSeverity
  /** Function or object name involved, e.g. `onPress`, `useEffect`. */
  target: string
  /** Source file when known (relative-ish), e.g. `App.tsx`. */
  file: string | null
  /** Compact human metric, e.g. `500ms JS-thread block`, `12.4 MB retained`. */
  metric: string
  message: string
  suggestion: string
}

export interface CpuProfileStats {
  totalSamples: number
  totalTimeMs: number
  /** Functions ranked by self time (descending). */
  hotFunctions: PerfFunctionInfo[]
  /** JS-thread blocking events ranked by duration (descending). */
  blockingEvents: BlockingEvent[]
  /** Sum of all blocking-event durations. */
  totalBlockingMs: number
}

export interface RetainedObject {
  name: string
  type: string
  retainedBytes: number
  selfBytes: number
}

export interface HeapStats {
  nodeCount: number
  totalHeapBytes: number
  /** Largest retained objects (reachability approximation from GC roots). */
  topRetained: RetainedObject[]
  /** Largest self-size allocations — the leak candidates. */
  topSelf: { name: string; type: string; selfBytes: number }[]
  /** Sum of retained bytes of the top-retained objects (not the whole heap). */
  totalRetainedBytes: number
}

export interface PerfAnalysis {
  cpu: CpuProfileStats | null
  heap: HeapStats | null
  findings: PerfFinding[]
}

/** Immutable baseline snapshot persisted as a knowledge-base artifact. */
export interface PerfBaselineSummary {
  capturedAt: number
  label: string
  totalBlockingMs: number
  totalRetainedBytes: number | null
  totalHeapBytes: number | null
  hotFunction: string | null
  topRetainedObject: string | null
}

export interface PerfCompareResult {
  regressions: PerfFinding[]
  deltas: {
    blockingMs: number
    blockingPct: number | null
    retainedBytes: number
    retainedPct: number | null
  }
}

export interface PerfAnalyzeOptions {
  /** Blocking-run threshold in ms (default 100). */
  blockingThresholdMs?: number
  /** Retained-size threshold in bytes before it becomes a finding (default 1 MB). */
  retainedThresholdBytes?: number
  /** How many hot functions / retained objects to report (default 10). */
  topN?: number
  /** Baseline regression thresholds. */
  blockingRegressionPct?: number
  retainedRegressionPct?: number
}
