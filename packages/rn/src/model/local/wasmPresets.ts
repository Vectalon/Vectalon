import { existsSync, readdirSync } from 'fs'
import { join } from 'path'
import { getModelDir } from './ModelStore'

/**
 * Zero-config WASM/ONNX model presets — Phase I of the "works everywhere"
 * story. These run through @huggingface/transformers (ONNX Runtime Web's WASM
 * backend): no API key, no native compilation, any CPU. Weights are downloaded
 * from Hugging Face Hub on first use and cached under the shared model store,
 * so `npm install` + `vectalon feature` produces real model output with zero
 * setup — the deterministic stub only remains as the graceful fallback.
 *
 * Sizing note: a real quantized code model is 250 MB–1.5 GB depending on
 * quantization; the smallest usable option (0.5B @ q8) is the default.
 */
export interface WasmModelPreset {
  id: string
  name: string
  /** Hugging Face Hub repo id with ONNX weights (quantized variants). */
  modelId: string
  /** transformers.js dtype — 'q8' (8-bit, default) or 'q4' (smaller). */
  dtype: 'q8' | 'q4'
  license: string
  licenseUrl?: string
  sizeMb: number
  description: string
  recommended: boolean
}

export const WASM_MODEL_PRESETS: WasmModelPreset[] = [
  {
    id: 'qwen2.5-coder-0.5b-wasm',
    name: 'Qwen2.5-Coder-0.5B-Instruct (ONNX q8, WASM)',
    modelId: 'onnx-community/Qwen2.5-Coder-0.5B-Instruct',
    dtype: 'q8',
    license: 'Apache-2.0',
    licenseUrl: 'https://huggingface.co/onnx-community/Qwen2.5-Coder-0.5B-Instruct',
    sizeMb: 540,
    description: 'Zero-config default — downloads on first use, runs on any CPU via WASM.',
    recommended: true,
  },
  {
    id: 'qwen2.5-coder-1.5b-wasm',
    name: 'Qwen2.5-Coder-1.5B-Instruct (ONNX q8, WASM)',
    modelId: 'onnx-community/Qwen2.5-Coder-1.5B-Instruct',
    dtype: 'q8',
    license: 'Apache-2.0',
    licenseUrl: 'https://huggingface.co/onnx-community/Qwen2.5-Coder-1.5B-Instruct',
    sizeMb: 1540,
    description: 'Better code quality than the 0.5B model; ~1.5 GB first-use download.',
    recommended: false,
  },
]

/** The active WASM preset — RN_VECTALON_WASM_MODEL can select by HF repo id. */
export function getWasmPreset(): WasmModelPreset {
  const override = process.env.RN_VECTALON_WASM_MODEL
  if (override) {
    const match = WASM_MODEL_PRESETS.find(p => p.modelId === override)
    if (match) return match
  }
  return WASM_MODEL_PRESETS[0]
}

/** Active quantization — RN_VECTALON_WASM_DTYPE=q4 selects the 4-bit variant. */
export function wasmDtype(): 'q8' | 'q4' {
  return process.env.RN_VECTALON_WASM_DTYPE === 'q4' ? 'q4' : 'q8'
}

/**
 * Where transformers.js caches the downloaded ONNX weights. Lives under the
 * shared model store so `vectalon models` sees it and a single env var
 * (RN_VECTALON_CONFIG_DIR) relocates it alongside the GGUF models.
 */
export function wasmCacheDir(): string {
  return join(getModelDir(), 'wasm')
}

/** True when the WASM cache already holds downloaded weights. */
export function wasmCacheReady(): boolean {
  try {
    const dir = wasmCacheDir()
    return existsSync(dir) && readdirSync(dir).length > 0
  } catch {
    return false
  }
}
