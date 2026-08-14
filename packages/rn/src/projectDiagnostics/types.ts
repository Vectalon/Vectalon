/**
 * Project Diagnostics (Roadmap Phase 2, items 011-015) — shared types.
 * Business Source License 1.1 (BSL-1.1)
 */
export type DiagStatus = 'pass' | 'warn' | 'fail' | 'info'

export interface DiagnosticCheck {
  id: string
  title: string
  category: 'metro' | 'hermes' | 'android' | 'ios' | 'deps'
  status: DiagStatus
  detail: string
  /** Concrete suggested fix (install command / config edit), when any. */
  fix?: string
}

export interface DiagnosticReport {
  schemaVersion: number
  generatedAt: string
  root: string
  durationMs: number
  checks: DiagnosticCheck[]
}

export interface LogAnalysis {
  /** Best-matching root cause, when a known pattern fired. */
  rootCause: { id: string; name: string; fix: string } | null
  /** Every pattern hit, most specific first. */
  matches: { id: string; name: string; line: number | null; fix: string }[]
  /** Lines that carried the matched patterns. */
  evidence: string[]
}
