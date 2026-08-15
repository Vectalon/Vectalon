/**
 * vectalon dataset — Fine-tuning Dataset Agent (Roadmap Phase 10, item 088)
 * Business Source License 1.1 (BSL-1.1)
 *
 * Validates a fine-tuning dataset (`.vectalon/dataset/*.jsonl`): schema
 * consistency, duplicates, label balance, length outliers, and PII leakage.
 * Deterministic — no model calls.
 */

export interface DatasetEntry {
  id?: string
  line: number
  format: 'chat' | 'instruction' | 'unknown'
  messages?: Array<{ role?: string; content?: unknown }>
  instruction?: string
  output?: string
  text: string
  meta?: Record<string, unknown>
  label?: string
}

export interface DatasetFinding {
  id: 'no-dataset' | 'malformed' | 'empty' | 'pii' | 'mixed-schema' | 'duplicates' | 'length-outliers' | 'label-imbalance'
  severity: 'warning' | 'info'
  line?: number
  message: string
  suggestion: string
}

export interface DatasetStat {
  entries: number
  files: number
  formats: Record<string, number>
  medianLength: number
  maxLength: number
  duplicates: number
  labels: Record<string, number>
}

export interface DatasetReport {
  scannedAt: number
  root: string
  filesScanned: number
  entries: DatasetEntry[]
  stats: DatasetStat
  findings: DatasetFinding[]
  verdict: 'approved' | 'needs-attention' | 'changes-requested'
  summary: { total: number; bySeverity: Record<string, number> }
}
