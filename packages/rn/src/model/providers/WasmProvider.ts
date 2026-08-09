import type { ModelRequest, ModelResponse } from '../types'
import { getWasmPreset, wasmCacheDir, wasmDtype, wasmCacheReady } from '../local/wasmPresets'
import { buildSkillsSystemPrompt, enrichWithSkills } from '../../ecosystem/skills'
import { buildToolCallSystemPrompt } from '../toolCalling'
import { RN_CODER_SYSTEM_PROMPT } from '../prompts'
import { logger } from '../../cli/logger'
import { reportError } from '../../utils/safe'
import { dynamicImport } from '../../utils/dynamicImport'

export interface WasmProviderOptions {
  /**
   * Project root — when set, enabled ecosystem skills
   * (.vectalon/skills/<id>/SKILL.md) are inlined into the system prompt of
   * every WASM generation, mirroring the local and remote providers.
   */
  projectRoot?: string
  /** Injectable skills-to-system-prompt builder (defaults to the ecosystem
   * loader). Tests inject a stub to verify the wiring without touching disk. */
  skillsLoader?: (root: string, systemPrompt?: string) => string | undefined
  /**
   * Injectable @huggingface/transformers loader (defaults to the real dynamic
   * import). Tests inject a stub so the pipeline is never actually loaded and
   * no model is ever downloaded.
   */
  loadTransformers?: () => Promise<unknown>
}

type ChatMessage = { role: string; content: string }

type GeneratorFn = (
  messages: ChatMessage[],
  options: Record<string, unknown>
) => Promise<Array<{ generated_text?: string }>>

interface TransformersModule {
  env?: { cacheDir?: string; allowLocalModels?: boolean }
  pipeline?: (
    task: string,
    model: string,
    options?: Record<string, unknown>
  ) => Promise<GeneratorFn>
}

/**
 * Zero-config ONNX/WASM inference provider.
 *
 * Runs a quantized code model through @huggingface/transformers (ONNX Runtime
 * Web's WASM backend): no API key, no native compilation, any CPU. Weights are
 * downloaded from Hugging Face Hub on first use and cached under the shared
 * model store (`~/.config/rn-vectalon/models/wasm`). When the runtime or the
 * download fails (e.g. no network), the provider degrades to the deterministic
 * stub with a clear warning — the stub is the graceful fallback, not the
 * primary path.
 */
export class WasmProvider {
  private initialized = false
  private fallback = false
  private modulePromise: Promise<TransformersModule> | null = null
  private generatorPromise: Promise<GeneratorFn> | null = null
  private readonly projectRoot?: string
  private readonly skillsLoader: (root: string, systemPrompt?: string) => string | undefined
  private readonly loadTransformers: () => Promise<unknown>

  constructor(options: WasmProviderOptions = {}) {
    this.projectRoot = options.projectRoot
    this.skillsLoader = options.skillsLoader || buildSkillsSystemPrompt
    this.loadTransformers =
      options.loadTransformers || (() => dynamicImport<TransformersModule>('@huggingface/transformers'))
  }

  /**
   * Idempotent probe: resolves the transformers package and confirms it exposes
   * a pipeline. Cheap (no weights are downloaded here — that happens lazily on
   * the first generate). The provider is marked ready either way so a
   * fire-and-forget initialize() from the router never blocks callers; the
   * generate path surfaces the real failure with a clear warning.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return
    try {
      await this.getModule()
    } catch (err) {
      reportError(err, 'Wasm model: @huggingface/transformers failed to load', 'warn')
    } finally {
      this.initialized = true
    }
  }

  isReady(): boolean {
    return this.initialized
  }

  /** Whether the last generate() degraded to the deterministic stub. */
  isFallback(): boolean {
    return this.fallback
  }

  async generate(request: ModelRequest): Promise<ModelResponse> {
    const baseSystem = request.systemPrompt || RN_CODER_SYSTEM_PROMPT
    const systemPrompt = enrichWithSkills(this.projectRoot, this.skillsLoader, baseSystem) ?? baseSystem

    try {
      const generator = await this.getPipeline()
      const messages = this.buildMessages(systemPrompt, request)
      const output = await generator(messages, {
        max_new_tokens: request.maxTokens || 2048,
        temperature: request.temperature ?? 0.2,
        do_sample: true,
        return_full_text: false,
      })
      const content = output?.[0]?.generated_text?.trim() || ''
      if (!content) {
        throw new Error('the model returned an empty generation')
      }
      return { content, provider: 'wasm' }
    } catch (err) {
      this.fallback = true
      reportError(err, 'Wasm model inference failed — falling back to the deterministic stub', 'warn')
      return this.fallbackResponse({ ...request, systemPrompt }, err instanceof Error ? err : undefined)
    }
  }

  private getModule(): Promise<TransformersModule> {
    if (!this.modulePromise) {
      this.modulePromise = this.loadTransformers().then(mod => {
        const typed = mod as TransformersModule
        if (!typed?.pipeline) {
          throw new Error('@huggingface/transformers did not expose a pipeline() — the package may have failed to load')
        }
        return typed
      })
    }
    return this.modulePromise
  }

  /**
   * Lazy pipeline loader. First use downloads the quantized ONNX weights from
   * Hugging Face Hub (progress logged at debug level) into the shared model
   * store and initializes the WASM runtime; subsequent calls reuse it.
   */
  private getPipeline(): Promise<GeneratorFn> {
    if (!this.generatorPromise) {
      this.generatorPromise = (async () => {
        const preset = getWasmPreset()
        const mod = await this.getModule()
        const env = mod.env
        if (env) {
          env.cacheDir = wasmCacheDir()
          env.allowLocalModels = false
        }
        const pipeline = mod.pipeline
        if (!pipeline) {
          throw new Error('@huggingface/transformers did not expose a pipeline()')
        }
        // Make the first-use download visible: it can take minutes on a slow
        // connection and previously only logged per-file progress at debug
        // level, which looked like a hang under the workflow spinner.
        if (!wasmCacheReady()) {
          logger.info(`Zero-config WASM: downloading ${preset.modelId} (${preset.dtype}, ~${Math.round(preset.sizeMb / 1024)} GB) on first use — cached at ${wasmCacheDir()}`)
        }
        return pipeline('text-generation', preset.modelId, {
          dtype: wasmDtype(),
          progress_callback: (progress: { status?: string; file?: string }) => {
            if (progress?.status === 'done' && progress.file) {
              logger.debug(`Wasm model: cached ${progress.file}`)
            }
          },
        })
      })()
    }
    return this.generatorPromise
  }

  private buildMessages(systemPrompt: string, request: ModelRequest): ChatMessage[] {
    let system = systemPrompt
    if (request.tools && request.tools.length > 0) {
      // The WASM runtime cannot constrain decoding to a grammar the way the
      // native GGUF path does (LlamaJsonSchemaGrammar), so tool-enabled
      // requests get the same { tool, arguments } / { answer } envelope
      // instructions the grammar enforces, plus a strictness hint. The agent
      // loop tolerates imperfect JSON and treats unparseable output as a
      // failed turn.
      system = `${systemPrompt}\n\n${buildToolCallSystemPrompt(request.tools)}\nOutput must be a single valid JSON object — no markdown fences.`
    }
    const context = request.context ? `\nContext:\n${request.context}\n` : ''
    const messages: ChatMessage[] = [{ role: 'system', content: system }]
    messages.push({ role: 'user', content: `${context}${request.prompt}` })
    return messages
  }

  private fallbackResponse(request: ModelRequest, err?: Error): ModelResponse {
    const context = request.context ? `\nContext:\n${request.context}\n` : ''
    const system = request.systemPrompt ? `System: ${request.systemPrompt}\n` : ''
    const fullPrompt = `${system}${context}${request.prompt}`

    const reason =
      'the ONNX/WASM model could not be loaded or generated — the first run downloads it from Hugging Face Hub, so this usually means no network access (or RN_VECTALON_NO_WASM is set)'
    let warning = `[Wasm model fallback: ${reason}.]`
    if (err) {
      warning += `\nError: ${err.message}`
    }

    return {
      content: `${warning}\n\n${fullPrompt}`,
      provider: 'wasm',
    }
  }
}
