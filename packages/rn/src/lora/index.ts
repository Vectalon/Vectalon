/**
 * vectalon lora — LoRA Training Readiness Agent (Roadmap Phase 10, item 089)
 * Business Source License 1.1 (BSL-1.1)
 *
 * One deterministic pass over the LoRA training workspace (default
 * `.vectalon/lora/`): validate the training config (dataset path, base model,
 * r/alpha/rank params, quantization, output dir), estimate VRAM from the
 * base-model size, and flag missing prerequisites. Reports to
 * docs/vectalon/lora/ (gitignored).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { LoraCheck, LoraFinding, LoraReport } from './types'

export type { LoraCheck, LoraFinding, LoraReport } from './types'

/** Where lora reports are written. */
export const loraDocsDir = (root: string): string => join(root, 'docs', 'vectalon', 'lora')

/** Default LoRA workspace location. */
export const LORA_DIR = '.vectalon/lora'

/** Rough VRAM estimate (GB) for a base model, by parameter count (billions). */
export function estimateVramGb(paramsB: number, bits: 4 | 8 | 16): number {
  // LoRA keeps the base weights frozen — the dominant cost is loading them
  // (quantized), plus small adapter/optimizer states and activations.
  const bytesPerParam = bits === 4 ? 0.5 : bits === 8 ? 1 : 2
  const weightsGb = paramsB * bytesPerParam
  const adapterGb = paramsB * 0.05 // LoRA params + Adam states (roughly 1% of model)
  const overheadGb = 1.5 + paramsB * 0.03 // CUDA context + activations
  return Math.round((weightsGb + adapterGb + overheadGb) * 100) / 100
}

const MODEL_PARAM_LOOKUP: Array<{ re: RegExp; paramsB: number }> = [
  { re: /llama-?3\.1?-?(70b|70)/i, paramsB: 70 },
  { re: /llama-?3\.1?-?(8b|8)/i, paramsB: 8 },
  { re: /llama-?2?-?(7b|7)/i, paramsB: 7 },
  { re: /llama-?3\.1?-?(405b|405)/i, paramsB: 405 },
  { re: /mistral-?(7b|7)/i, paramsB: 7 },
  { re: /mixtral-?(8x7b)/i, paramsB: 47 },
  { re: /qwen2?(\.5)?-(0\.5b|1\.5b|3b|7b|14b|32b|72b)/i, paramsB: 3 },
  { re: /codellama-?(7b|13b|34b|70b)/i, paramsB: 7 },
]

/** Best-effort param count (billions) from a base-model id. */
export function paramsOfModel(model: string): number | undefined {
  const m = model.match(/(\d+(?:\.\d+)?)b/i)
  if (m) return Number(m[1])
  for (const { re, paramsB } of MODEL_PARAM_LOOKUP) {
    if (re.test(model)) return paramsB
  }
  return undefined
}

export interface LoraConfig {
  datasetPath?: string
  baseModel?: string
  r?: number
  alpha?: number
  bits?: 4 | 8 | 16
  outputDir?: string
  epochs?: number
  batchSize?: number
  useWandb?: boolean
}

/** Parse the LoRA config (JSON or YAML-subset). */
export function parseLoraConfig(content: string): LoraConfig {
  const cfg: LoraConfig = {}
  const trimmed = content.trim()
  const yamlish = trimmed.startsWith('{') ? null : trimmed
  if (yamlish) {
    for (const line of yamlish.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z0-9_-]+)\s*:\s*(.*?)\s*$/)
      if (!m) continue
      const [key, raw] = [m[1], m[2].replace(/^["']|["']$/g, '')]
      if (key === 'dataset' || key === 'dataset_path' || key === 'data_path') cfg.datasetPath = raw
      if (key === 'model' || key === 'base_model' || key === 'model_name') cfg.baseModel = raw
      if (key === 'r' || key === 'lora_r' || key === 'rank') cfg.r = Number(raw)
      if (key === 'alpha' || key === 'lora_alpha') cfg.alpha = Number(raw)
      if (key === 'bits' || key === 'load_in_4bit') cfg.bits = raw === '4' || raw === 'true' ? 4 : raw === '8' ? 8 : raw === '16' || raw === 'false' ? 16 : undefined
      if (key === 'output_dir' || key === 'output') cfg.outputDir = raw
      if (key === 'epochs' || key === 'num_epochs') cfg.epochs = Number(raw)
      if (key === 'batch_size' || key === 'per_device_train_batch_size') cfg.batchSize = Number(raw)
      if (key === 'use_wandb' || key === 'report_to') cfg.useWandb = raw === 'true' || raw === 'wandb'
    }
    return cfg
  }
  try {
    const raw = JSON.parse(content) as Record<string, unknown>
    cfg.datasetPath = typeof raw.dataset === 'string' ? raw.dataset : typeof raw.datasetPath === 'string' ? raw.datasetPath : undefined
    cfg.baseModel = typeof raw.model === 'string' ? raw.model : typeof raw.baseModel === 'string' ? raw.baseModel : undefined
    cfg.r = typeof raw.r === 'number' ? raw.r : undefined
    cfg.alpha = typeof raw.alpha === 'number' ? raw.alpha : undefined
    cfg.bits = raw.bits === 4 ? 4 : raw.bits === 8 ? 8 : raw.bits === 16 ? 16 : raw.loadIn4bit === true ? 4 : undefined
    cfg.outputDir = typeof raw.outputDir === 'string' ? raw.outputDir : undefined
    cfg.epochs = typeof raw.epochs === 'number' ? raw.epochs : undefined
    cfg.batchSize = typeof raw.batchSize === 'number' ? raw.batchSize : undefined
    cfg.useWandb = raw.useWandb === true || raw.reportTo === 'wandb'
  } catch {
    return cfg
  }
  return cfg
}

/** Run the LoRA readiness pass. */
export function runLoraScan(root: string, configOverride?: string): LoraReport {
  const scannedAt = Date.now()
  const checks: LoraCheck[] = []
  const findings: LoraFinding[] = []
  const push = (id: string, severity: LoraFinding['severity'] | 'pass' | 'warn' | 'fail', label: string, message: string, suggestion: string) => {
    const normalized: 'pass' | 'warn' | 'fail' | 'info' = severity === 'error' ? 'fail' : severity === 'warning' ? 'warn' : severity === 'pass' || severity === 'warn' || severity === 'fail' || severity === 'info' ? severity : 'pass'
    checks.push({ id, label, status: normalized, message, suggestion })
    const sev: LoraFinding['severity'] = normalized === 'fail' ? 'error' : normalized === 'warn' ? 'warning' : 'info'
    if (normalized !== 'pass') findings.push({ id, severity: sev, message, suggestion })
  }

  const dir = join(root, LORA_DIR)
  const configPath = configOverride ?? join(dir, 'config.json')
  let config: LoraConfig | null = null
  if (configOverride || existsSync(configPath)) {
    try {
      config = parseLoraConfig(readFileSync(configPath, 'utf-8'))
    } catch {
      push('config', 'error', 'Training config', 'Config file exists but could not be read', 'Fix the config file permissions or content.')
    }
  }

  if (!config) {
    push('config', 'error', 'Training config', 'No .vectalon/lora/config.json (or YAML) found', 'Create the config with dataset path, base model, r/alpha, and output dir.')
    return { scannedAt, root, config: undefined, checks, findings, verdict: 'changes-requested', summary: { total: findings.length, bySeverity: { error: findings.length } } }
  }
  push('config', 'pass', 'Training config', 'Config found and parsed', 'Good.')

  // Dataset.
  if (config.datasetPath) {
    const ds = join(root, config.datasetPath)
    if (existsSync(ds) && !ds.endsWith('.jsonl')) {
      push('dataset', 'warn', 'Dataset', `Dataset path ${config.datasetPath} is a directory, not a JSONL file`, 'Point dataset at a validated JSONL file (run `vectalon dataset` first).')
    } else if (existsSync(ds)) {
      push('dataset', 'pass', 'Dataset', `Dataset found at ${config.datasetPath}`, 'Good.')
    } else {
      push('dataset', 'error', 'Dataset', `Dataset not found at ${config.datasetPath}`, 'Export the training data to that path before training.')
    }
  } else {
    push('dataset', 'error', 'Dataset', 'No dataset path in the config', 'Add the dataset path so training has data.')
  }

  // Base model + VRAM.
  if (config.baseModel) {
    const paramsB = paramsOfModel(config.baseModel)
    if (paramsB !== undefined) {
      push('model', 'pass', 'Base model', `Base model "${config.baseModel}" (${paramsB}B)`, 'Good.')
      const bits = config.bits ?? 4
      const vram = estimateVramGb(paramsB, bits)
      push('vram', vram <= 24 ? 'pass' : 'warn', 'VRAM estimate', `~${vram} GB for ${paramsB}B model at ${bits}-bit (from "${config.baseModel}")`, 'Use a smaller model, deeper quantization (QLoRA 4-bit), or a higher-VRAM GPU.')
    } else {
      push('model', 'info', 'Base model', `Base model "${config.baseModel}" — param count unrecognized`, 'Include the size in the model id (e.g. llama-3.1-8b) so VRAM can be estimated.')
    }
  } else {
    push('model', 'error', 'Base model', 'No base model in the config', 'Set base_model to the HF id of the model to fine-tune.')
  }

  // LoRA hyperparams.
  if (config.r === undefined || config.alpha === undefined) {
    if (config.r === undefined) push('hyperparams', 'warning', 'LoRA hyperparams', 'No `r` (rank) in the config', 'Set r (commonly 8–64); larger r = more capacity, more VRAM.')
    if (config.alpha === undefined) push('hyperparams', 'warning', 'LoRA hyperparams', 'No `alpha` in the config', 'Set alpha (commonly 2× r).')
  } else {
    push('hyperparams', 'pass', 'LoRA hyperparams', `r=${config.r}, alpha=${config.alpha}`, 'Good.')
  }
  if (config.bits === undefined) push('hyperparams', 'info', 'Quantization', 'No bits / load_in_4bit setting', 'Set 4-bit QLoRA to fit larger models on consumer GPUs.')
  if (config.outputDir) {
    const out = join(root, config.outputDir)
    if (!existsSync(out)) {
      push('output', 'info', 'Output dir', `Output ${config.outputDir} does not exist yet`, 'The trainer will create it; confirm the parent is writable.')
    } else {
      push('output', 'pass', 'Output dir', `Output dir exists at ${config.outputDir}`, 'Good.')
    }
  } else {
    push('output', 'warning', 'Output dir', 'No output_dir in the config', 'Set output_dir so the adapter and logs have a home.')
  }

  // Wandb / logging.
  if (config.useWandb === true) {
    push('wandb', 'info', 'Experiment tracking', 'use_wandb=true — needs WANDB_API_KEY at run time', 'Export WANDB_API_KEY in the training environment (never commit it).')
  } else {
    push('wandb', 'pass', 'Experiment tracking', 'No wandb dependency declared', 'Optional: enable wandb for run comparison.')
  }

  const bySeverity: Record<string, number> = {}
  for (const f of findings) bySeverity[f.severity] = (bySeverity[f.severity] ?? 0) + 1
  const verdict: LoraReport['verdict'] = findings.some(f => f.severity === 'error') ? 'changes-requested' : findings.some(f => f.severity === 'warning') ? 'needs-attention' : 'approved'
  return { scannedAt, root, config, checks, findings, verdict, summary: { total: findings.length, bySeverity } }
}

/** Render the lora report as markdown. */
export function renderLoraMarkdown(report: LoraReport): string {
  const lines = ['# vectalon lora — LoRA Training Readiness', '']
  lines.push(`Checks: ${report.checks.length}  ·  Verdict: **${report.verdict}**`, '', '| Check | Status | Detail |', '|---|---|---|')
  for (const c of report.checks) {
    const mark = c.status === 'pass' ? '✅' : c.status === 'warn' ? '⚠️' : '❌'
    lines.push(`| ${c.label} | ${mark} ${c.status} | ${c.message} |`)
  }
  if (report.findings.length > 0) {
    lines.push('', '## Findings', '')
    for (const f of report.findings) {
      const mark = f.severity === 'error' ? 'ERROR' : f.severity === 'warning' ? 'WARN' : 'INFO'
      lines.push(`### [${mark}] ${f.id}`, '', f.message, '', `**Fix**: ${f.suggestion}`, '')
    }
  }
  return lines.join('\n')
}

/** Write the markdown + JSON report. */
export function writeLoraReport(root: string, report: LoraReport): { mdPath: string; jsonPath: string } {
  const dir = loraDocsDir(root)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const mdPath = join(dir, 'report.md')
  const jsonPath = join(dir, 'report.json')
  writeFileSync(mdPath, renderLoraMarkdown(report), 'utf-8')
  writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf-8')
  return { mdPath, jsonPath }
}
