/**
 * vectalon crash — Crash Intelligence Agent (Roadmap Phase 9, item 071)
 * Business Source License 1.1 (BSL-1.1)
 *
 * Classifies a crash report (iOS, Android, or JS/RN stack trace) into a
 * root-cause bucket with the standard fix and investigation steps.
 * Deterministic — no model calls, no network.
 */

export type CrashPlatform = 'ios' | 'android' | 'javascript'

export interface CrashFrame {
  filename?: string
  function?: string
  lineno?: number
  inApp?: boolean
}

export interface ParsedCrashLog {
  platform: CrashPlatform
  exceptionType?: string
  message?: string
  culprit?: string
  release?: string
  frames: CrashFrame[]
}

export interface CrashFinding {
  bucket: string
  probableCause: string
  severity: 'error' | 'warning' | 'info'
  fix: string
  investigation: string[]
}

export interface CrashReport {
  parsedAt: number
  platform: CrashPlatform
  source: string
  exceptionType?: string
  message?: string
  release?: string
  topFrames: string[]
  finding: CrashFinding
  verdict: 'approved' | 'needs-attention' | 'changes-requested'
}

export interface CrashOptions {
  /** Force platform detection (default: auto-detect). */
  platform?: CrashPlatform
}
