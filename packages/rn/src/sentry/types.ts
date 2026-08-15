/**
 * vectalon sentry — Sentry Intelligence Agent (Roadmap Phase 10, item 081)
 * Business Source License 1.1 (BSL-1.1)
 *
 * Reads Sentry/Crashlytics telemetry exports from `.vectalon/telemetry/`,
 * groups crash events into classes (by exception type / fingerprint), ranks
 * them by volume and user impact, and attaches a RootCauseAnalyzer verdict to
 * each class. Deterministic — no model calls.
 */

export interface SentryCrashClass {
  /** Stable grouping key (exception type, else message, else event id). */
  key: string
  exceptionType?: string
  message?: string
  releases: string[]
  eventCount: number
  /** Distinct user ids attributed to this class. */
  userCount: number
  bucket: string
  probableCause: string
  investigation: string[]
  firstSeen?: number
  lastSeen?: number
  severity: 'critical' | 'warning' | 'info'
}

export interface SentryFinding {
  id: 'crash-class' | 'regression' | 'no-telemetry'
  severity: 'critical' | 'warning' | 'info'
  key?: string
  message: string
  suggestion: string
}

export interface SentryReport {
  scannedAt: number
  root: string
  filesScanned: number
  events: number
  crashClasses: SentryCrashClass[]
  findings: SentryFinding[]
  verdict: 'approved' | 'needs-attention' | 'changes-requested'
  summary: { total: number; bySeverity: Record<string, number> }
}
