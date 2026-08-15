/**
 * vectalon cost — Cost Governance Agent (Roadmap Phase 11, item 099)
 * Business Source License 1.1 (BSL-1.1)
 *
 * Surfaces cloud + model spend risk before the invoice: inference and
 * GPU-hour estimates from project config, with explicit rate assumptions.
 * Deterministic — estimates are labeled as estimates, never invoices.
 */

export type CostVerdict = 'approved' | 'needs-attention' | 'changes-requested'

export interface CostLineItem {
  id: string
  label: string
  amountUsd: number
  basis: string
}

export interface CostReport {
  scannedAt: number
  root: string
  lines: CostLineItem[]
  totalUsd: number
  assumptions: string[]
  findings: Array<{ id: string; severity: 'warning' | 'info'; message: string; suggestion: string }>
  verdict: CostVerdict
}
