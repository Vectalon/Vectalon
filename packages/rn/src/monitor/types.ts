/**
 * vectalon monitor — Observability Dashboard Agent (Roadmap Phase 11,
 * item 094) — Business Source License 1.1 (BSL-1.1)
 *
 * Folds telemetry into one executive view: crash classes, instrumentation
 * gaps, slow traces, and the engineering dashboard's overall verdict.
 * Deterministic — no model calls.
 */

export type MonitorVerdict = 'approved' | 'needs-attention' | 'changes-requested'

export interface MonitorSurface {
  id: string
  label: string
  verdict: string
  summary: string
  present: boolean
}

export interface MonitorReport {
  scannedAt: number
  root: string
  surfaces: MonitorSurface[]
  crashClasses: number
  telemetryEvents: number
  findings: Array<{ id: string; severity: 'warning' | 'info'; message: string; suggestion: string }>
  verdict: MonitorVerdict
}
