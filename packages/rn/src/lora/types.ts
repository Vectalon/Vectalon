/**
 * vectalon lora — LoRA Training Readiness Agent (Roadmap Phase 10, item 089)
 * Business Source License 1.1 (BSL-1.1)
 *
 * Checks the prerequisites of a LoRA fine-tuning run: training config
 * (dataset, base model, r/alpha, quantization, output dir) and a VRAM
 * estimate derived from the base-model size. Deterministic — no model calls.
 */

export interface LoraCheck {
  id: string
  label: string
  status: 'pass' | 'warn' | 'fail' | 'info'
  message: string
  suggestion: string
}

export interface LoraFinding {
  id: string
  severity: 'error' | 'warning' | 'info'
  message: string
  suggestion: string
}

export interface LoraReport {
  scannedAt: number
  root: string
  config?: { datasetPath?: string; baseModel?: string; r?: number; alpha?: number; bits?: number; outputDir?: string; epochs?: number; batchSize?: number; useWandb?: boolean }
  checks: LoraCheck[]
  findings: LoraFinding[]
  verdict: 'approved' | 'needs-attention' | 'changes-requested'
  summary: { total: number; bySeverity: Record<string, number> }
}
