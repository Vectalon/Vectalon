import { getConfig } from '../config'
import { LocalProvider } from './providers/LocalProvider'
import { RemoteProvider } from './providers/RemoteProvider'
import { WasmProvider } from './providers/WasmProvider'
import type { ModelConfig, ModelRequest, ModelResponse, ModelProviderType } from './types'
import { REMOTE_PROVIDERS } from './setup'
import { wasmZeroConfigEnabled } from './zeroConfig'
import { getDefaultPreset } from './local/presets'
import { getWasmPreset } from './local/wasmPresets'
import { hasDownloadedModel } from './local/ModelStore'
import { CircuitBreaker } from './circuitBreaker'
import { reportError } from '../utils/safe'
import { logger } from '../cli/logger'

export interface ModelRouterOptions {
  /** Project root threaded into local + WASM providers (skills enrichment). */
  projectRoot?: string
  /** Injected WASM provider (tests inject one with a stubbed loader). */
  wasmProvider?: WasmProvider
  /** Override the env-gated zero-config WASM tier decision (tests). */
  zeroConfigEnabled?: boolean
  /** Injectable circuit breaker (tests inject one with a fake clock). */
  circuitBreaker?: CircuitBreaker
}

interface ProviderAttempt {
  /** Provider id for circuit tracking (remote ids, 'local', 'wasm'). */
  id: string
  run: () => Promise<ModelResponse>
}

export class ModelRouter {
  private provider: ModelProviderType = 'local'
  private localProvider: LocalProvider | null = null
  private remoteProviders: Map<string, RemoteProvider> = new Map()
  private wasmProvider: WasmProvider | null = null
  private readonly injectedWasmProvider?: WasmProvider
  private readonly zeroConfigOverride?: boolean
  private readonly projectRoot?: string
  private readonly circuit: CircuitBreaker

  constructor(options: ModelRouterOptions = {}) {
    this.injectedWasmProvider = options.wasmProvider
    this.zeroConfigOverride = options.zeroConfigEnabled
    this.projectRoot = options.projectRoot
    this.circuit = options.circuitBreaker || new CircuitBreaker()
  }

  /**
   * @param config provider choice plus optional project-level model settings
   *   (modelName / apiKeyEnv from .vectalon/rn-vectalon.json via init).
   */
  initialize(config?: Partial<ModelConfig>): void {
    this.provider = config?.provider || (getConfig('modelProvider') as ModelProviderType) || 'local'

    if (this.provider === 'local') {
      void this.getLocalProvider().initialize()
    } else if (this.provider === 'wasm') {
      // Explicit WASM provider (--model wasm or manifest) — always available;
      // it is not gated on downloaded GGUF models.
      void this.getWasmProvider().initialize()
    } else {
      this.remoteProviders.set(this.provider, new RemoteProvider(this.provider, {
        modelName: config?.modelName,
        apiKeyEnv: config?.apiKeyEnv,
        endpoint: config?.endpoint,
      }, {
        projectRoot: this.projectRoot,
      }))
    }
  }

  /**
   * Generate a model response. Never throws for provider failures (P0-7):
   * the call is retried once, then walks a fallback chain — remote → local
   * native → WASM → a deterministic stub that carries a clear error message.
   * A provider whose circuit is open is skipped entirely (3 failures in 60s
   * short-circuits it for 5 minutes).
   */
  async generate(request: ModelRequest): Promise<ModelResponse> {
    const errors: string[] = []
    const primary = this.provider

    // 1. Primary attempt (with one retry for transient failures).
    if (this.circuit.isOpen(primary)) {
      errors.push(`${primary} is short-circuited (circuit open) — skipping`)
    } else {
      const attempts = this.circuitStateKnown(primary) ? 1 : 2
      for (let attempt = 1; attempt <= attempts; attempt++) {
        const outcome = await this.tryPrimary(request)
        if (outcome.ok) {
          this.circuit.recordSuccess(primary)
          return outcome.response
        }
        this.circuit.recordFailure(primary)
        errors.push(outcome.error)
        if (attempt < attempts) {
          logger.debug(`ModelRouter: ${primary} attempt ${attempt} failed (${outcome.error}) — retrying`)
        }
      }
    }

    // 2. Fallback chain: local native → WASM → deterministic stub.
    const fallbacks = await this.buildFallbackAttempts(request)
    for (const fallback of fallbacks) {
      if (this.circuit.isOpen(fallback.id)) {
        errors.push(`${fallback.id} is short-circuited (circuit open) — skipping`)
        continue
      }
      const result = await this.tryProvider(fallback)
      if (result.ok) {
        this.circuit.recordSuccess(fallback.id)
        return result.response
      }
      this.circuit.recordFailure(fallback.id)
      errors.push(result.error)
    }

    // 3. Last rung — the deterministic stub. Clear, honest, never throws.
    reportError(new Error(errors.join('; ')), 'ModelRouter: all providers failed, returning deterministic stub', 'warn')
    return this.stubResponse(request, errors)
  }

  async getProviderStatus(): Promise<Record<string, boolean>> {
    const status: Record<string, boolean> = {
      local: this.localProvider?.isReady() ?? false,
      wasm: this.wasmProvider?.isReady() ?? false,
    }
    // Derived from the registry so future remote providers are reported
    // automatically instead of requiring a manual entry here.
    for (const info of REMOTE_PROVIDERS) {
      status[info.id] = this.remoteProviders.has(info.id)
    }
    return status
  }

  isLocalFallback(): boolean {
    return (
      this.provider === 'local' &&
      (this.localProvider?.isFallback() === true || this.wasmProvider?.isFallback() === true)
    )
  }

  /** Whether the zero-config WASM tier is enabled by config/env. */
  private zeroConfigEnabled(): boolean {
    if (this.zeroConfigOverride !== undefined) return this.zeroConfigOverride
    return wasmZeroConfigEnabled()
  }

  /**
   * True when a 'local' run will actually use the zero-config WASM tier — i.e.
   * no GGUF model is downloaded AND the tier is enabled. Used by the CLI to
   * print an accurate model label and first-run download hint.
   */
  isZeroConfigActive(): boolean {
    if (this.provider !== 'local' || !this.localProvider) return false
    if (hasDownloadedModel(getDefaultPreset().id)) return false
    return this.zeroConfigEnabled()
  }

  /** The provider id this router is currently initialized with (health checks). */
  getProviderId(): ModelProviderType {
    return this.provider
  }

  /** Circuit state per provider (health checks / diagnostics). */
  getCircuitSnapshots(): Array<{ provider: string; state: string; failures: number; openUntil: number | null }> {
    const ids = new Set<string>([this.provider, 'local', 'wasm', ...this.remoteProviders.keys()])
    return [...ids].map(id => this.circuit.snapshot(id)).map(s => ({
      provider: s.provider,
      state: s.state,
      failures: s.failures,
      openUntil: s.openUntil,
    }))
  }

  /**
   * Human-readable label of the model that will actually generate code: the
   * WASM model when the zero-config tier is active for 'local', the GGUF
   * preset otherwise, the WASM model for 'wasm', and the raw provider string
   * for remotes (callers format remote model names via activeModelLabel).
   */
  getActiveLabel(): string {
    if (this.provider === 'wasm') {
      return `wasm (${getWasmPreset().modelId})`
    }
    if (this.provider === 'local') {
      if (this.isZeroConfigActive()) {
        return `local → wasm (${getWasmPreset().modelId})`
      }
      return `local (${getDefaultPreset().id})`
    }
    return this.provider
  }

  /* ------------------------------------------------------------------ */
  /* Primary + fallback internals                                        */
  /* ------------------------------------------------------------------ */

  /** True once the primary has failed at least once (then skip the retry). */
  private circuitStateKnown(provider: string): boolean {
    // Known trouble — failures inside the recent window OR a circuit that has
    // been tripped (half-open after cooldown) — means skip the retry. Total
    // historical failures must NOT gate it: a provider that failed long ago,
    // whose circuit fully closed again, deserves its one transient retry. A
    // half-open trial is a single probe, not a retry candidate.
    const snap = this.circuit.snapshot(provider)
    return snap.failures > 0 || snap.state !== 'closed'
  }

  /**
   * Run the primary provider exactly as configured. Local/WASM degrade
   * internally (they never throw) so their outcome is a success; remotes can
   * throw and surface here as a failure.
   */
  private async tryPrimary(request: ModelRequest): Promise<{ ok: true; response: ModelResponse } | { ok: false; error: string }> {
    if (this.provider === 'wasm') {
      return this.tryProvider({ id: 'wasm', run: () => this.getWasmProvider().generate(request) })
    }

    if (this.provider === 'local' && this.localProvider) {
      // Settle the node-llama-cpp capability probe before choosing the path,
      // so a fire-and-forget initialize() never races the decision.
      await this.localProvider.initialize()
      const nativeReady = this.localProvider.isNativeAvailable() && hasDownloadedModel(getDefaultPreset().id)
      if (nativeReady) {
        return this.tryProvider({ id: 'local', run: () => this.localProvider!.generate(request) })
      }
      // Zero-config tier: no GGUF model is downloaded — try the ONNX/WASM
      // runtime (downloads on first use) before degrading to the deterministic
      // stub, so `npm install` + `vectalon feature` works with zero setup.
      if (this.zeroConfigEnabled()) {
        return this.tryProvider({ id: 'wasm', run: () => this.getWasmProvider().generate(request) })
      }
      return this.tryProvider({ id: 'local', run: () => this.localProvider!.generate(request) })
    }

    const remoteProvider = this.remoteProviders.get(this.provider)
    if (remoteProvider) {
      return this.tryProvider({ id: this.provider, run: () => remoteProvider.generate(request) })
    }

    return { ok: false, error: `No provider available for: ${this.provider}` }
  }

  /** Run one provider attempt, normalizing throws into a failure result. */
  private async tryProvider(
    attempt: ProviderAttempt
  ): Promise<{ ok: true; response: ModelResponse } | { ok: false; error: string }> {
    try {
      const response = await attempt.run()
      return { ok: true, response }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return { ok: false, error: `${attempt.id} failed: ${message}` }
    }
  }

  /**
   * The fallback chain after the primary fails: local native inference, then
   * the WASM runtime, then the deterministic stub. The zero-config tier
   * gating only applies to a 'local' primary (auto-tiering); remote primaries
   * always get the WASM rung so a dead remote still reaches a real model.
   */
  private async buildFallbackAttempts(request: ModelRequest): Promise<ProviderAttempt[]> {
    const local = this.getLocalProvider()
    await local.initialize()
    const localNative = local.isNativeAvailable() && hasDownloadedModel(getDefaultPreset().id)

    const attempts: ProviderAttempt[] = []
    if (localNative) {
      attempts.push({ id: 'local', run: () => local.generate(request) })
    }
    // The WASM rung is gated by the zero-config tier (opt-in): it downloads a
    // quantized model on first use, so it must never appear in a fallback chain
    // the user didn't opt into. In production (non-test env) the tier defaults
    // to enabled when @huggingface/transformers resolves.
    const useWasm = this.zeroConfigEnabled()
    if (useWasm) {
      attempts.push({ id: 'wasm', run: () => this.getWasmProvider().generate(request) })
    }
    return attempts
  }

  /** Deterministic last-resort response with a clear, aggregated error. */
  private stubResponse(request: ModelRequest, errors: string[]): ModelResponse {
    const context = request.context ? `\nContext:\n${request.context}\n` : ''
    const system = request.systemPrompt ? `System: ${request.systemPrompt}\n` : ''
    const fullPrompt = `${system}${context}${request.prompt}`
    const warning = `[Model fallback: every provider failed — ${errors.join('; ')}. No model output was generated.]`
    return {
      content: `${warning}\n\n${fullPrompt}`,
      provider: this.provider,
    }
  }

  private getLocalProvider(): LocalProvider {
    if (!this.localProvider) {
      this.localProvider = new LocalProvider({ projectRoot: this.projectRoot })
      void this.localProvider.initialize()
    }
    return this.localProvider
  }

  private getWasmProvider(): WasmProvider {
    if (!this.wasmProvider) {
      this.wasmProvider = this.injectedWasmProvider || new WasmProvider({ projectRoot: this.projectRoot })
    }
    return this.wasmProvider
  }
}
