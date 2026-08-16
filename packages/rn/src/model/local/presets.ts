export interface ModelPreset {
  id: string
  name: string
  uri: string
  license: string
  licenseUrl?: string
  description: string
  sizeGb: number
  recommended: boolean
}

export const DEFAULT_PRESET_ID = 'qwen2.5-coder-1.5b'

export const MODEL_PRESETS: ModelPreset[] = [
  {
    id: 'qwen2.5-coder-1.5b',
    name: 'Qwen2.5-Coder-1.5B-Instruct (Q4_K_M)',
    uri: 'hf:Qwen/Qwen2.5-Coder-1.5B-Instruct-GGUF:Q4_K_M',
    license: 'Apache-2.0',
    licenseUrl: 'https://huggingface.co/Qwen/Qwen2.5-Coder-1.5B-Instruct-GGUF/blob/main/LICENSE',
    description: 'Small, fast, Apache-2.0 code model. Good for laptops and CI.',
    sizeGb: 1.1,
    recommended: true,
  },
  {
    id: 'qwen2.5-coder-3b',
    name: 'Qwen2.5-Coder-3B-Instruct (Q4_K_M)',
    uri: 'hf:Qwen/Qwen2.5-Coder-3B-Instruct-GGUF:Q4_K_M',
    license: 'Apache-2.0',
    licenseUrl: 'https://huggingface.co/Qwen/Qwen2.5-Coder-3B-Instruct-GGUF/blob/main/LICENSE',
    description: 'Better code quality than the 1.5B model. Requires ~2 GB RAM.',
    sizeGb: 2.0,
    recommended: false,
  },
  {
    id: 'qwen2.5-coder-7b',
    name: 'Qwen2.5-Coder-7B-Instruct (Q4_K_M)',
    uri: 'hf:Qwen/Qwen2.5-Coder-7B-Instruct-GGUF:Q4_K_M',
    license: 'Apache-2.0',
    licenseUrl: 'https://huggingface.co/Qwen/Qwen2.5-Coder-7B-Instruct-GGUF/blob/main/LICENSE',
    description: 'The flagship local code model — strongest output, needs a beefy machine (32 GB RAM class).',
    sizeGb: 4.7,
    recommended: false,
  },
]

/**
 * Usage tiers — the three knobs a user actually chooses between (the roadmap's
 * fast / balanced / quality presets). Each tier maps to a concrete GGUF model
 * preset and a minimum-RAM band; `autoSelectUsagePreset` picks one from the
 * machine's total RAM so a user never has to think about it. The tier is what
 * init persists (modelPreset), while the model id it resolves to is what the
 * manifest's modelConfig.modelName carries into the ModelRouter.
 */
export type UsagePresetId = 'fast' | 'balanced' | 'quality'

export interface UsagePreset {
  id: UsagePresetId
  label: string
  /** The ModelPreset.id this tier runs inference against. */
  modelId: string
  /** Minimum total system RAM for a comfortable run. */
  minRamGb: number
  /** RAM band label shown in `vectalon models`. */
  ramLabel: string
  description: string
}

export const USAGE_PRESETS: UsagePreset[] = [
  {
    id: 'fast',
    label: 'Fast',
    modelId: 'qwen2.5-coder-1.5b',
    minRamGb: 8,
    ramLabel: '8 GB RAM',
    description: 'Small, fast, Apache-2.0 code model — laptops and CI.',
  },
  {
    id: 'balanced',
    label: 'Balanced',
    modelId: 'qwen2.5-coder-3b',
    minRamGb: 16,
    ramLabel: '16 GB RAM',
    description: 'Better code quality than fast — the default on 16 GB machines.',
  },
  {
    id: 'quality',
    label: 'Quality',
    modelId: 'qwen2.5-coder-7b',
    minRamGb: 32,
    ramLabel: '32 GB RAM',
    description: 'The flagship local model — strongest RN output, needs a beefy machine.',
  },
]

export function getPreset(id: string): ModelPreset | undefined {
  return MODEL_PRESETS.find(p => p.id === id)
}

export function getDefaultPreset(): ModelPreset {
  return MODEL_PRESETS.find(p => p.id === DEFAULT_PRESET_ID) || MODEL_PRESETS[0]
}

export function listPresets(): ModelPreset[] {
  return MODEL_PRESETS
}

export function getUsagePreset(id: string): UsagePreset | undefined {
  return USAGE_PRESETS.find(p => p.id === id)
}

export function listUsagePresets(): UsagePreset[] {
  return USAGE_PRESETS
}

/**
 * Resolve a user-supplied preset value (a usage tier like `balanced`, or a raw
 * model preset id like `qwen2.5-coder-3b`) to a concrete ModelPreset.
 * Unknown values return undefined — callers decide whether to error or fall
 * back to the default.
 */
export function resolvePresetValue(value: string | undefined): ModelPreset | undefined {
  if (!value) return undefined
  const usage = getUsagePreset(value)
  if (usage) return getPreset(usage.modelId)
  return getPreset(value)
}

/**
 * Auto-select the usage tier from total system RAM (GB): the highest tier
 * whose minimum fits. 8 GB → fast, 16 GB → balanced, 32 GB+ → quality.
 * This is what init uses so the model choice never needs a thought.
 */
export function autoSelectUsagePreset(totalRamGb: number): UsagePreset {
  let best = USAGE_PRESETS[0]
  for (const p of USAGE_PRESETS) {
    if (totalRamGb >= p.minRamGb) best = p
  }
  return best
}

/** Convenience: the model preset id auto-selected for a machine's RAM. */
export function autoSelectModelId(totalRamGb: number): string {
  return autoSelectUsagePreset(totalRamGb).modelId
}
