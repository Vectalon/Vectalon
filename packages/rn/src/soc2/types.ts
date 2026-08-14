/**
 * vectalon soc2 — SOC2 Readiness Agent (Roadmap Phase 9, item 075)
 * Business Source License 1.1 (BSL-1.1)
 *
 * A deterministic readiness checklist mapped to the five SOC2 trust service
 * criteria (Security, Availability, Processing Integrity, Confidentiality,
 * Privacy) plus operational hygiene: access control, audit logging,
 * encryption, backups, incident response, vendor/dependency management, and
 * data retention. Each control is a file/config probe; evidence is cited.
 */

export interface Soc2Control {
  id: string
  criteria: string
  title: string
  status: 'pass' | 'fail' | 'partial' | 'n/a'
  evidence: string
  suggestion: string
}

export interface Soc2Report {
  scannedAt: number
  root: string
  controls: Soc2Control[]
  score: number
  verdict: 'approved' | 'needs-attention' | 'changes-requested'
  summary: { total: number; pass: number; partial: number; fail: number }
}
