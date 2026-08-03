import type { ModelPreset } from './presets'
import { dynamicImport } from '../../utils/dynamicImport'
import { getDownloadedModel } from './ModelStore'

export interface InferenceOptions {
  systemPrompt?: string
  prompt: string
  temperature?: number
  maxTokens?: number
}

export interface InferenceResult {
  content: string
  modelId: string
  tokensUsed?: number
}

/**
 * Build the LlamaChatSession options. Extracted so the critical systemPrompt
 * pass-through (the root cause of local intent detection returning unknown) is
 * unit-testable without loading the native node-llama-cpp module.
 */
export function createChatSessionOptions<T>(
  contextSequence: T,
  systemPrompt?: string
): { contextSequence: T; systemPrompt?: string } {
  return { contextSequence, systemPrompt }
}

/**
 * The node-llama-cpp native addon prints tokenizer warnings (e.g.
 * "control-looking token: 128247 '</s>' ...") directly to stderr, bypassing
 * the JS logger callback. Override stderr.write for the duration of model
 * load so these noisy lines don't corrupt the CLI spinner output.
 */
async function withSuppressedTokenizerWarnings<T>(fn: () => Promise<T>): Promise<T> {
  const originalWrite = process.stderr.write.bind(process.stderr)
  const patchedWrite = (
    chunk: string | Uint8Array,
    encodingOrCb?: BufferEncoding | ((err?: Error | null | undefined) => void),
    cb?: (err?: Error | null | undefined) => void
  ): boolean => {
    const text = typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf-8')
    if (text.includes('control-looking token')) {
      if (typeof encodingOrCb === 'function') {
        encodingOrCb(null)
      } else if (typeof cb === 'function') {
        cb(null)
      }
      return true
    }
    if (typeof encodingOrCb === 'function') {
      return originalWrite(chunk, encodingOrCb)
    }
    return originalWrite(chunk, encodingOrCb, cb)
  }
  process.stderr.write = patchedWrite as typeof process.stderr.write
  try {
    return await fn()
  } finally {
    process.stderr.write = originalWrite
  }
}

export async function runInference(modelId: string, options: InferenceOptions): Promise<InferenceResult> {
  const model = getDownloadedModel(modelId)
  if (!model) {
    throw new Error(`Model ${modelId} is not downloaded. Run 'vectalon pull' first.`)
  }

  try {
    const nlc = await dynamicImport<typeof import('node-llama-cpp')>('node-llama-cpp')
    const llama = await withSuppressedTokenizerWarnings(() =>
      nlc.getLlama({
        // Quiet llama.cpp's noisy tokenizer warnings (e.g. the "control-looking
        // token" notice Qwen GGUF files emit on load) while keeping real errors.
        logger: (level, message) => {
          if (message.includes('control-looking token')) return
          if (level <= nlc.LlamaLogLevel.warn) {
            const sink = level <= nlc.LlamaLogLevel.error ? console.error : console.warn
            sink(`[node-llama-cpp] ${message}`)
          }
        },
      })
    )
    const llamaModel = await withSuppressedTokenizerWarnings(() =>
      llama.loadModel({ modelPath: model.filePath })
    )
    const context = await llamaModel.createContext()
    const session = new nlc.LlamaChatSession(
      createChatSessionOptions(context.getSequence(), options.systemPrompt)
    )

    const response = await session.prompt(options.prompt, {
      temperature: options.temperature ?? 0.2,
      maxTokens: options.maxTokens ?? 2048,
    })

    return {
      content: response,
      modelId,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new Error(`Inference failed for model ${modelId}: ${message}`)
  }
}

export async function runInferenceWithPreset(
  preset: ModelPreset,
  options: InferenceOptions
): Promise<InferenceResult> {
  return runInference(preset.id, options)
}
