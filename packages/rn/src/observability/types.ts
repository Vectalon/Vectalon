/**
 * vectalon observability — Mobile Observability Agent (Roadmap Phase 10, item 082)
 * Business Source License 1.1 (BSL-1.1)
 *
 * Audits the observability posture of a mobile repo: instrumentation
 * coverage in source (Sentry init, crash handlers, analytics SDK, network
 * breadcrumbs, performance tracing) and slow traces/spans in telemetry
 * exports. Deterministic — no model calls.
 */

export interface ObsFinding {
  id:
    | 'no-sentry-init'
    | 'no-crash-handler'
    | 'no-analytics-sdk'
    | 'no-network-breadcrumb'
    | 'no-performance-tracing'
    | 'slow-trace'
  severity: 'warning' | 'info'
  file?: string
  line?: number
  message: string
  suggestion: string
}

export interface ObsSlowSpan {
  op: string
  description?: string
  durationMs: number
}

export interface ObsSlowTrace {
  name: string
  durationMs: number
  spans: ObsSlowSpan[]
  release?: string
}

export interface ObsReport {
  scannedAt: number
  root: string
  tracesScanned: number
  slowTraces: ObsSlowTrace[]
  findings: ObsFinding[]
  verdict: 'approved' | 'needs-attention' | 'changes-requested'
  summary: { total: number; bySeverity: Record<string, number> }
}
