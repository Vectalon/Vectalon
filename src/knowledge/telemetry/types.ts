/** Shared types for runtime telemetry ingestion (Sentry / Firebase Crashlytics / performance / analytics). */

export type TelemetryKind = 'crash' | 'performance' | 'analytics'

export interface TelemetryFrame {
  filename?: string
  function?: string
  lineno?: number
  inApp?: boolean
}

export interface ParsedCrash {
  kind: 'crash'
  id: string
  source: 'sentry' | 'crashlytics'
  platform?: string
  release?: string
  environment?: string
  /** Epoch milliseconds. */
  timestamp?: number
  exceptionType?: string
  message?: string
  culprit?: string
  frames: TelemetryFrame[]
  fingerprint?: string[]
  tags?: Record<string, string>
  user?: { id?: string; email?: string; ipAddress?: string }
}

export interface ParsedTrace {
  kind: 'performance'
  name: string
  op?: string
  durationMs: number
  /** Epoch milliseconds. */
  startTimestamp?: number
  spans?: { op?: string; description?: string; durationMs: number }[]
  platform?: string
  release?: string
  source: 'sentry' | 'firebase' | 'generic'
}

export interface ParsedAnalyticsEvent {
  kind: 'analytics'
  name: string
  /** Epoch milliseconds. */
  timestamp?: number
  properties?: Record<string, string | number | boolean>
  userId?: string
  platform?: string
  source: 'firebase' | 'generic'
}

export type TelemetryEvent = ParsedCrash | ParsedTrace | ParsedAnalyticsEvent

export type TelemetryFormat = 'sentry' | 'crashlytics' | 'performance' | 'analytics' | 'unknown'

export interface TelemetryIngestResult {
  ingestedAt: number
  filesScanned: number
  events: TelemetryEvent[]
  crashes: ParsedCrash[]
  traces: ParsedTrace[]
  analytics: ParsedAnalyticsEvent[]
  artifacts: { id: string; title: string; type: string }[]
  skipped: number
  errors: { file: string; error: string }[]
}
