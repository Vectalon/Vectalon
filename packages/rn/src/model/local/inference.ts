import type { ModelPreset } from './presets'
import { dynamicImport } from '../../utils/dynamicImport'
import { reportError } from '../../utils/safe'
import { getDownloadedModel } from './ModelStore'
import { createLlamaLogFilter, NOISE_LINE_MAX_LENGTH, shouldSuppressStderrLine, couldBecomeNoiseLine } from './llamaLog'

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
  /**
   * Called with each decoded text chunk as the model streams (node-llama-cpp
   * `onTextChunk`). Optional — MCP/agent paths omit it, so their behavior is
   * byte-for-byte unchanged.
   */
  onTextChunk?: (text: string) => void
}

export interface InferenceResult {
  content: string
  modelId: string
  tokensUsed?: number
}

/**
 * Probe whether the optional node-llama-cpp native module can actually be
 * loaded on this machine. node-llama-cpp is an `optionalDependency`: on
 * constrained systems the install (or its postinstall native build) may be
 * skipped, in which case `import('node-llama-cpp')` rejects. The probe catches
 * that so LocalProvider can degrade to the deterministic stub with a clear
 * warning instead of failing at inference time.
 *
 * Returns a discriminated reason so callers can tailor the message:
 * `true` when loadable, `'missing'` when the module isn't installed, or
 * `'failed'` when it is installed but throws on load (e.g. broken native
 * binary). Both failure modes are "no local model" — only the explanation
 * differs.
 */
/**
 * True when `err` is a "module not found" failure (package absent or its entry
 * unresolved). Handles both the CommonJS `MODULE_NOT_FOUND` message and the
 * ESM `ERR_MODULE_NOT_FOUND` / "Cannot find package" shape a dynamic import of
 * a missing optional dependency produces.
 */
export function isMissingModuleError(err: unknown): boolean {
  if (err instanceof Error) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === 'MODULE_NOT_FOUND' || code === 'ERR_MODULE_NOT_FOUND') return true
    if (err.message.includes('Cannot find module') || err.message.includes('Cannot find package')) return true
  }
  return false
}

/** Whether the optional module's entry can be resolved on disk. */
function canResolveNodeLlamaCpp(): boolean {
  try {
    require.resolve('node-llama-cpp')
    return true
  } catch (err) {
    reportError(err, 'Local model: resolving node-llama-cpp entry point')
    return false
  }
}

export async function probeNativeModule(): Promise<true | 'missing' | 'failed'> {
  try {
    await dynamicImport<typeof import('node-llama-cpp')>('node-llama-cpp')
    return true
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    // Jest runs tests in a VM without --experimental-vm-modules, so the
    // Function-constructor dynamic import rejects there even though the module
    // is installed and loads fine in real Node. Fall back to a resolution
    // check so the probe reports availability correctly in tests too.
    if (code === 'ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING_FLAG') {
      return canResolveNodeLlamaCpp() ? true : 'missing'
    }
    return isMissingModuleError(err) ? 'missing' : 'failed'
  }
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
 * Install a permanent, process-wide stderr line filter that swallows the
 * known-harmless llama.cpp tokenizer noise for the lifetime of the process.
 *
 * Why permanent instead of per-inference? llama.cpp logs are marshalled from
 * the native addon to the JS thread asynchronously (node-llama-cpp buffers log
 * chunks and dispatches them on the microtask queue), so a tokenizer warning
 * can land AFTER a per-inference wrapper has already restored the original
 * stderr writer. A filter installed once, at the first model load, can never
 * be raced past.
 *
 * Decision per newline-less partial:
 * - contains the full pattern (even without a newline) → dropped;
 * - could still grow into the pattern AND is short enough to be a split noise
 *   line → held for the next write;
 * - anything else — progress bars that overwrite a line with `\r` and no
 *   newline, ordinary partial writes — forwarded immediately.
 *
 * A still-held partial is suppressed (never written) on process exit, and the
 * filter is idempotent: calling it more than once is a no-op.
 */
let noiseFilterInstalled = false
let exitFlushRegistered = false
// The held-partial buffer lives at module scope so the one-time `beforeExit`
// drain always clears the CURRENT filter's buffer, even if a test (or an
// embedded embedder) reinstalls the filter after a reset — the drain is never
// detached from the active buffer.
let filterBuffer = ''

export function installStderrNoiseFilter(): void {
  if (noiseFilterInstalled) return
  noiseFilterInstalled = true

  // stderr is a synchronous fd write; the default utf8 encoding is preserved.
  const realWrite = process.stderr.write.bind(process.stderr)

  const write = (
    chunk: string | Uint8Array,
    encodingOrCb?: BufferEncoding | ((err?: Error | null | undefined) => void),
    cb?: (err?: Error | null | undefined) => void
  ): boolean => {
    const text = typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf-8')
    filterBuffer += text

    // Flush every complete line (newline-terminated).
    let newlineIndex: number
    while ((newlineIndex = filterBuffer.indexOf('\n')) >= 0) {
      const line = filterBuffer.slice(0, newlineIndex + 1)
      filterBuffer = filterBuffer.slice(newlineIndex + 1)
      if (!shouldSuppressStderrLine(line)) realWrite(line)
    }

    // Trailing newline-less partial:
    // 1. Full pattern present → the noise line arrived without its newline.
    // 2. Short noise-candidate → hold for the next write (split line).
    // 3. Everything else (progress bars etc.) → forward immediately.
    if (filterBuffer.length > 0) {
      if (shouldSuppressStderrLine(filterBuffer)) {
        filterBuffer = ''
      } else if (!couldBecomeNoiseLine(filterBuffer) || filterBuffer.length > NOISE_LINE_MAX_LENGTH) {
        realWrite(filterBuffer)
        filterBuffer = ''
      }
    }

    if (typeof encodingOrCb === 'function') {
      encodingOrCb(null)
    } else if (typeof cb === 'function') {
      cb(null)
    }
    return true
  }

  process.stderr.write = write as typeof process.stderr.write

  // node-llama-cpp registers its own process-lifetime listeners per engine
  // (Llama instance, temp-dir cleanup, disposables — roughly a dozen
  // beforeExit handlers with the shared engine). Together with our drain
  // listener that crosses Node's default cap of 10, tripping
  // MaxListenersExceededWarning. These are intentional, non-leaking
  // listeners, so raise the cap once — just high enough for the known engine
  // internals plus headroom, not an unbounded 0.
  if (process.getMaxListeners() < 64) {
    process.setMaxListeners(64)
  }

  // A partial still held at exit is by definition a split noise line whose
  // tail never arrived (or noise without a newline) — suppress it rather than
  // print it, so the filter can never leak the very noise it exists to hide.
  // Registered once per process regardless of how many times the filter is
  // installed. `beforeExit` alone suffices: it fires when the event loop
  // drains (the graceful-exit point); on a hard `process.exit()` the buffer is
  // simply never written.
  if (!exitFlushRegistered) {
    exitFlushRegistered = true
    process.on('beforeExit', () => {
      filterBuffer = ''
    })
  }
}

/**
 * Exposed for tests: reset the installed-filter flag so a fresh filter can be
 * installed in a clean test environment.
 */
export function _resetStderrNoiseFilterForTests(): void {
  noiseFilterInstalled = false
}

/**
 * Exposed for tests: drop the shared llama/model caches so each test starts
 * with a fresh engine (engine reuse is module-level process state).
 */
export function _resetSharedEngineForTests(): void {
  sharedLlamaPromise = null
  sharedModels.clear()
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

/**
 * Process-wide singleton inference engine. Each `getLlama()` call creates a new
 * Llama instance that registers a `beforeExit` cleanup listener and reloads the
 * GGUF from disk — repeated calls (e.g. one per benchmark scenario) leak
 * listeners and re-pay the multi-second model load every time. We memoize the
 * llama + model so every inference in the process shares one engine.
 *
 * The engine is created lazily on first use and cached for the process
 * lifetime; a failed load resets the cache so a later call can retry.
 */
type LlamaModule = typeof import('node-llama-cpp')
type SharedLlama = Awaited<ReturnType<LlamaModule['getLlama']>>
type SharedModel = Awaited<ReturnType<SharedLlama['loadModel']>>
type SharedContext = Awaited<ReturnType<SharedModel['createContext']>>
type LlamaContextSequence = ReturnType<SharedContext['getSequence']>

let sharedLlamaPromise: Promise<SharedLlama> | null = null

async function getSharedLlama(): Promise<SharedLlama> {
  if (!sharedLlamaPromise) {
    // Install the permanent noise filter at the very first model load: from
    // here on, llama.cpp tokenizer warnings can never corrupt the terminal
    // output, no matter when the native addon dispatches them.
    installStderrNoiseFilter()
    sharedLlamaPromise = (async () => {
      const nlc = await dynamicImport<LlamaModule>('node-llama-cpp')
      const logFilter = createLlamaLogFilter()
      const llama = await nlc.getLlama({
        // Gate at the C level first (logLevel) so sub-warn llama.cpp chatter
        // never reaches JS, then route everything that does through the
        // filtered logger. The old `level <= LlamaLogLevel.warn` comparison
        // was a string-enum bug (LlamaLogLevel is a string enum in v3) that
        // re-emitted info/debug lines as warnings — the filter's severity map
        // fixes that too.
        logLevel: nlc.LlamaLogLevel.warn,
        logger: logFilter,
      })
      // loadModel/createContext have no per-call logger option; components
      // inherit the Llama instance's logger property, so assign the filter
      // here to cover every derived engine component (the actual gap).
      llama.logger = logFilter
      return llama
    })()
    // A rejected engine promise must not poison the cache forever: reset so the
    // next caller retries, while still surfacing the error to this caller.
    sharedLlamaPromise.catch(() => {
      sharedLlamaPromise = null
    })
  }
  return sharedLlamaPromise
}

/** Loaded models keyed by GGUF path: one engine, one model per path, reused across every inference. */
const sharedModels = new Map<string, Promise<SharedModel>>()

/** Load the GGUF once per process; subsequent inferences reuse the loaded model. */
async function getSharedModel(llama: SharedLlama, modelPath: string): Promise<SharedModel> {
  let modelPromise = sharedModels.get(modelPath)
  if (!modelPromise) {
    modelPromise = llama.loadModel({ modelPath })
    modelPromise.catch(() => {
      sharedModels.delete(modelPath)
    })
    sharedModels.set(modelPath, modelPromise)
  }
  return modelPromise
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
      const llama = await getSharedLlama()
      const llamaModel = await getSharedModel(llama, model.filePath)
      const context = await llamaModel.createContext()
      const session = new nlc.LlamaChatSession(
        createChatSessionOptions(context.getSequence() as LlamaContextSequence, options.systemPrompt)
      )

      // Constrained decoding: force the model to emit JSON matching the schema
      // (tool-call envelopes). LlamaJsonSchemaGrammar needs the llama instance;
      // the generic class defeats Parameters<>, so cast the constructor.
      type LlamaGrammarInstance = InstanceType<typeof nlc.LlamaGrammar>
      type GrammarCtor = new (llama: unknown, schema: Record<string, unknown>) => LlamaGrammarInstance
      const Grammar = nlc.LlamaJsonSchemaGrammar as unknown as GrammarCtor
      const grammar = options.grammarSchema ? new Grammar(llama, options.grammarSchema) : undefined

      try {
        const response = await session.prompt(options.prompt, {
          temperature: options.temperature ?? 0.2,
          maxTokens: options.maxTokens ?? 2048,
          // Anti-repetition sampling: Qwen2.5-Coder's known failure mode on long
          // outputs (e.g. multi-file benchmark replies) is a broken-record loop
          // that echoes recent fixture text until maxTokens — the result never
          // forms valid JSON and the run scores 0 files. minP prunes the
          // low-probability tail and a wide repeat window with frequency
          // penalty suppresses verbatim loops (node-llama-cpp's default repeat
          // window of 64 tokens is far too short to catch whole-block echoes).
          minP: 0.05,
          repeatPenalty: {
            penalty: 1.1,
            lastTokens: 512,
            frequencyPenalty: 0.3,
            presencePenalty: 0.2,
          },
          ...(grammar ? { grammar } : {}),
          ...(options.onTextChunk ? { onTextChunk: options.onTextChunk } : {}),
        })

        return {
          content: response,
          modelId,
        }
      } finally {
        // Per-inference VRAM hygiene: the shared engine memoizes the llama +
        // model (never re-loaded), but each generation allocates a fresh
        // context. Leaking them — the previous behavior — exhausted VRAM
        // after the first successful generation on larger models (the 7B
        // failed the SECOND benchmark scenario with "context size ... too
        // large for the available VRAM"). Dispose the session's sequence and
        // the context so every inference returns its VRAM before the next
        // one starts. Both are no-ops if already disposed; a failed prompt
        // still releases the context on the way out.
        try {
          session.dispose({ disposeSequence: true })
        } catch {
          // Disposal must never mask the inference result/error.
        }
        try {
          await context.dispose()
        } catch {
          // Same — best-effort release only.
        }
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
