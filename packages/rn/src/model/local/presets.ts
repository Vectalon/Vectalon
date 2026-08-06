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
