/**
 * vectalon cost — Cost Governance Agent (Roadmap Phase 11, item 099)
 * Business Source License 1.1 (BSL-1.1)
 *
 * Estimates cloud + model spend from project config — LoRA training
 * (VRAM × hours), eval runs (case count × tokens), dataset preprocessing
 * (bytes), and configured model endpoints. Rates are explicit assumptions,
 * so the estimate is auditable. Reports to docs/vectalon/cost/
 * (gitignored).
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { CostLineItem, CostReport, CostVerdict } from './types'

export type { CostLineItem, CostReport, CostVerdict } from './types'

/** Where cost reports are written. */
export const costDocsDir = (root: string): string => join(root, 'docs', 'vectalon', 'cost')

/** Assumptions used for estimates — kept explicit so they can be audited. */
export const RATE_ASSUMPTIONS = {
  /** USD per GPU-hour for a training run at the VRAM class. */
  gpuHour: 1.2,
  /** USD per million input tokens for the configured/default model. */
  perMTokens: 1.0,
  /** USD per GB processed for dataset embedding/preprocessing. */
  perGb: 0.2,
} as const

function readJson(file: string): unknown | null {
  try {
    if (!existsSync(file)) return null
    return JSON.parse(readFileSync(file, 'utf-8'))
  } catch {
    return null
  }
}

function fileBytes(root: string, rel: string): number {
  try {
    return statSync(join(root, rel)).size
  } catch {
    return 0
  }
}

function gb(bytes: number): number {
  return bytes / (1024 * 1024 * 1024)
}

/** Run one cost-estimate pass. */
export function runCost(root: string): CostReport {
  const scannedAt = Date.now()
  const lines: CostLineItem[] = []
  const findings: CostReport['findings'] = []
  const assumptions = [
    `GPU hour: $${RATE_ASSUMPTIONS.gpuHour} (spot-class instance)`,
    `Tokens: $${RATE_ASSUMPTIONS.perMTokens}/1M input tokens (mid-range hosted model)`,
    `Data processing: $${RATE_ASSUMPTIONS.perGb}/GB`,
  ]

  // LoRA training — VRAM class from the lora config.
  const lora = readJson(join(root, '.vectalon', 'lora', 'config.json')) as
    | { model?: string; baseModel?: string; vramGb?: number; dataset?: string; datasetPath?: string; r?: number; alpha?: number }
    | null
  if (lora) {
    const vram = lora.vramGb ?? 16
    // 4 epochs over a typical dataset at this VRAM class ≈ 6 GPU-hours base + scaling.
    const hours = 6 + (vram > 24 ? 6 : 0)
    const amountUsd = Math.round(hours * RATE_ASSUMPTIONS.gpuHour * 100) / 100
    lines.push({
      id: 'lora-training',
      label: `LoRA training — ${lora.model ?? lora.baseModel ?? 'base model'} @ ${vram}GB VRAM`,
      amountUsd,
      basis: `${hours} GPU-hours × $${RATE_ASSUMPTIONS.gpuHour}`,
    })
    findings.push({
      id: 'lora-estimate',
      severity: 'info',
      message: `Estimated LoRA training spend: $${amountUsd} (${hours} GPU-hours at ${vram}GB VRAM).`,
      suggestion: 'Add an explicit budget and a stop condition before launching training.',
    })
  }

  // Dataset volume — bytes under .vectalon/dataset + the lora dataset path.
  let datasetBytes = 0
  for (const rel of datasetFiles(root)) datasetBytes += fileBytes(root, rel)
  if (datasetBytes > 0) {
    const amountUsd = Math.round(gb(datasetBytes) * RATE_ASSUMPTIONS.perGb * 100) / 100
    lines.push({
      id: 'dataset-processing',
      label: 'Dataset preprocessing',
      amountUsd,
      basis: `${gb(datasetBytes).toFixed(2)}GB × $${RATE_ASSUMPTIONS.perGb}`,
    })
  }

  // Eval runs — case count × assumed tokens per case.
  const evalCases = readJson(join(root, '.vectalon', 'evals', 'cases.json')) as Array<{ id?: string }> | { cases?: Array<{ id?: string }> } | null
  const caseCount = evalCases ? (Array.isArray(evalCases) ? evalCases.length : evalCases.cases?.length ?? 0) : 0
  if (caseCount > 0) {
    const tokens = caseCount * 2000 // assumed ~1k in + 1k out per case
    const amountUsd = Math.round((tokens / 1_000_000) * RATE_ASSUMPTIONS.perMTokens * 100) / 100
    lines.push({
      id: 'eval-runs',
      label: `Eval inference (${caseCount} cases)`,
      amountUsd,
      basis: `~${tokens.toLocaleString()} tokens × $${RATE_ASSUMPTIONS.perMTokens}/1M`,
    })
  }

  // Model endpoint config — the harness model provider, if configured.
  const config = readJson(join(root, '.vectalon', 'config.json')) as { model?: string; provider?: string; endpoint?: string } | null
  if (config?.model || config?.endpoint) {
    findings.push({
      id: 'model-endpoint',
      severity: 'info',
      message: `Model endpoint configured (${config.model ?? config.endpoint}) — inference spend is metered per token and not bounded by this estimate.`,
      suggestion: 'Set a per-month token budget in the provider console and monitor it alongside the dashboard.',
    })
  }

  const totalUsd = Math.round(lines.reduce((s, l) => s + l.amountUsd, 0) * 100) / 100

  if (lines.length === 0) {
    findings.push({
      id: 'no-cost-surfaces',
      severity: 'info',
      message: 'No cost surfaces found — no LoRA config, dataset, or eval cases.',
      suggestion: 'Add .vectalon/lora/config.json, datasets, or eval cases to get a spend estimate.',
    })
  }
  if (totalUsd > 500) {
    findings.push({
      id: 'budget-alert',
      severity: 'warning',
      message: `Estimated spend exceeds $500/mo ($${totalUsd}).`,
      suggestion: 'Add a budget gate to the release train and monitor spend in the dashboard.',
    })
  }

  const verdict: CostVerdict = findings.some(f => f.severity === 'warning') ? 'needs-attention' : 'approved'
  return { scannedAt, root, lines, totalUsd, assumptions, findings, verdict }
}

/** List dataset files under .vectalon/dataset. */
export function datasetFiles(root: string): string[] {
  const base = join(root, '.vectalon', 'dataset')
  try {
    return readdirSync(base).filter(f => f.endsWith('.jsonl') || f.endsWith('.json')).map(f => `.vectalon/dataset/${f}`)
  } catch {
    return []
  }
}

/** Render the estimate as markdown. */
export function renderCostMarkdown(report: CostReport): string {
  const lines = ['# vectalon cost — Spend Estimate', '', '> Estimates, not invoices — rates below are explicit assumptions.', '']
  lines.push(`Total: **$${report.totalUsd}/mo**  ·  Verdict: **${report.verdict}**`, '', '| Item | Amount | Basis |', '|---|---|---|')
  for (const l of report.lines) lines.push(`| ${l.label} | $${l.amountUsd} | ${l.basis} |`)
  lines.push('', '## Assumptions', '')
  for (const a of report.assumptions) lines.push(`- ${a}`)
  lines.push('', '## Findings', '')
  for (const f of report.findings) {
    const mark = f.severity === 'warning' ? 'WARN' : 'INFO'
    lines.push(`### [${mark}] ${f.id}`, '', f.message, '', `**Suggestion**: ${f.suggestion}`, '')
  }
  return lines.join('\n')
}

/** Write the markdown + JSON report. */
export function writeCostReport(root: string, report: CostReport): { mdPath: string; jsonPath: string } {
  const dir = costDocsDir(root)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const mdPath = join(dir, 'report.md')
  const jsonPath = join(dir, 'report.json')
  writeFileSync(mdPath, renderCostMarkdown(report), 'utf-8')
  writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf-8')
  return { mdPath, jsonPath }
}
