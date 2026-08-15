/**
 * vectalon governance — Enterprise Governance Agent (Roadmap Phase 10, item 083)
 * Business Source License 1.1 (BSL-1.1)
 *
 * Audits enterprise-governance evidence in a repository: license, security
 * policy, contributing guide, CODEOWNERS, PR template, lockfile/SBOM,
 * Dependabot, and CI. Deterministic — no model calls.
 */

export interface GovCheck {
  id: string
  label: string
  status: 'pass' | 'warn' | 'fail'
  evidence: string
  detail: string
}

export interface GovFinding {
  id: string
  severity: 'warning' | 'info'
  message: string
  suggestion: string
}

export interface GovReport {
  scannedAt: number
  root: string
  checks: GovCheck[]
  findings: GovFinding[]
  verdict: 'approved' | 'needs-attention' | 'changes-requested'
  summary: { total: number; bySeverity: Record<string, number> }
}
