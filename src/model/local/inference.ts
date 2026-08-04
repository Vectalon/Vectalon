import type { ModelPreset } from './presets'
import { dynamicImport } from '../../utils/dynamicImport'
import { getDownloadedModel } from './ModelStore'

export interface InferenceOptions {
  systemPrompt?: string
  prompt: string
  temperature?: number
  maxTokens?: number
  /**
   * JSON Schema for constrained (grammar) decoding. When present, a
   * LlamaJsonSchemaGrammar is built from it so the model can only emit JSON
   * matching the schema (used for tool-calling envelopes).
   */
  grammarSchema?: Record<string, unknown>
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
 * Known-harmless tokenizer noise that must never reach the CLI output. Qwen
 * GGUF files emit a "control-looking token" notice on load (the tokenizer
 * marks 128247 '</s>' as non-control; node-llama-cpp overrides the type).
 * The model works fine — the line just corrupts the spinner output.
 */
export function shouldSuppressStderrLine(line: string): boolean {
  return line.includes('control-looking token')
}

/**
 * The node-llama-cpp native addon prints tokenizer warnings (e.g.
 * "control-looking token: 128247 '</s>' ...") directly to stderr, bypassing
 * the JS logger callback, and it can fire at load time OR lazily at the first
 * prompt (chat-wrapper resolution). Override stderr.write for the duration of
 * the whole inference so these noisy lines never corrupt the CLI spinner
 * output. Everything else passes through unchanged.
 */
// Reentrancy guard: if two suppressions overlap (e.g. concurrent model calls
// via the MCP server), only the outermost call patches stderr. Without this, a
// call that finishes while another is mid-flight could restore a stale patch
// object and leave every future stderr write going through a dead wrapper.
let suppressionActive = false

export async function withSuppressedTokenizerWarnings<T>(fn: () => Promise<T>): Promise<T> {
  if (suppressionActive) {
    // Nested/concurrent call — the outer wrapper already has the patch installed.
    return fn()
  }
  suppressionActive = true
  const originalWrite = process.stderr.write
  // Bound copy for invocation (full overload set); the unbound original is
  // restored afterwards so the property identity is unchanged.
  const boundWrite = originalWrite.bind(process.stderr)
  const patchedWrite = (
    chunk: string | Uint8Array,
    encodingOrCb?: BufferEncoding | ((err?: Error | null | undefined) => void),
    cb?: (err?: Error | null | undefined) => void
  ): boolean => {
    const text = typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf-8')
    if (shouldSuppressStderrLine(text)) {
      if (typeof encodingOrCb === 'function') {
        encodingOrCb(null)
      } else if (typeof cb === 'function') {
        cb(null)
      }
      return true
    }
    if (typeof encodingOrCb === 'function') {
      return boundWrite(chunk, encodingOrCb)
    }
    return boundWrite(chunk, encodingOrCb, cb)
  }
  process.stderr.write = patchedWrite as typeof process.stderr.write
  try {
    return await fn()
  } finally {
    process.stderr.write = originalWrite
    suppressionActive = false
  }
}

export async function runInference(modelId: string, options: InferenceOptions): Promise<InferenceResult> {
  const model = getDownloadedModel(modelId)
  if (!model) {
    throw new Error(`Model ${modelId} is not downloaded. Run 'vectalon pull' first.`)
  }

  try {
    const nlc = await dynamicImport<typeof import('node-llama-cpp')>('node-llama-cpp')
    // Suppress the known-harmless tokenizer warning for the ENTIRE inference:
    // it can fire at getLlama/loadModel time OR lazily at the first prompt when
    // the chat wrapper resolves. The logger callback also filters it for the
    // JS-level log path (belt and braces — some builds emit via console).
    return await withSuppressedTokenizerWarnings(async () => {
      const llama = await nlc.getLlama({
        logger: (level, message) => {
          if (shouldSuppressStderrLine(message)) return
          if (level <= nlc.LlamaLogLevel.warn) {
            const sink = level <= nlc.LlamaLogLevel.error ? console.error : console.warn
            sink(`[node-llama-cpp] ${message}`)
          }
        },
      })
      const llamaModel = await llama.loadModel({ modelPath: model.filePath })
      const context = await llamaModel.createContext()
      const session = new nlc.LlamaChatSession(
        createChatSessionOptions(context.getSequence(), options.systemPrompt)
      )

      // Constrained decoding: force the model to emit JSON matching the schema
      // (tool-call envelopes). LlamaJsonSchemaGrammar needs the llama instance;
      // the generic class defeats Parameters<>, so cast the constructor.
      type LlamaGrammarInstance = InstanceType<typeof nlc.LlamaGrammar>
      type GrammarCtor = new (llama: unknown, schema: Record<string, unknown>) => LlamaGrammarInstance
      const Grammar = nlc.LlamaJsonSchemaGrammar as unknown as GrammarCtor
      const grammar = options.grammarSchema ? new Grammar(llama, options.grammarSchema) : undefined

      const response = await session.prompt(options.prompt, {
        temperature: options.temperature ?? 0.2,
        maxTokens: options.maxTokens ?? 2048,
        ...(grammar ? { grammar } : {}),
      })

      return {
        content: response,
        modelId,
      }
    })
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
