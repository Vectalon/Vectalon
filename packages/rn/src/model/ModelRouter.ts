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

export interface ModelRouterOptions {
  /** Project root threaded into local + WASM providers (skills enrichment). */
  projectRoot?: string
  /** Injected WASM provider (tests inject one with a stubbed loader). */
  wasmProvider?: WasmProvider
  /** Override the env-gated zero-config WASM tier decision (tests). */
  zeroConfigEnabled?: boolean
}

export class ModelRouter {
  private provider: ModelProviderType = 'local'
  private localProvider: LocalProvider | null = null
  private remoteProviders: Map<string, RemoteProvider> = new Map()
  private wasmProvider: WasmProvider | null = null
  private readonly injectedWasmProvider?: WasmProvider
  private readonly zeroConfigOverride?: boolean
  private readonly projectRoot?: string

  constructor(options: ModelRouterOptions = {}) {
    this.injectedWasmProvider = options.wasmProvider
    this.zeroConfigOverride = options.zeroConfigEnabled
    this.projectRoot = options.projectRoot
  }

  /**
   * @param config provider choice plus optional project-level model settings
   *   (modelName / apiKeyEnv from .vectalon/rn-vectalon.json via init).
   */
  initialize(config?: Partial<ModelConfig>): void {
    this.provider = config?.provider || (getConfig('modelProvider') as ModelProviderType) || 'local'

    if (this.provider === 'local') {
      this.localProvider = new LocalProvider({ projectRoot: this.projectRoot })
      void this.localProvider.initialize()
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

  async generate(request: ModelRequest): Promise<ModelResponse> {
    if (this.provider === 'wasm') {
      return this.getWasmProvider().generate(request)
    }

    if (this.provider === 'local' && this.localProvider) {
      // Settle the node-llama-cpp capability probe before choosing the path,
      // so a fire-and-forget initialize() never races the decision.
      await this.localProvider.initialize()
      const nativeReady = this.localProvider.isNativeAvailable() && hasDownloadedModel(getDefaultPreset().id)
      if (nativeReady) {
        return this.localProvider.generate(request)
      }
      // Zero-config tier: no GGUF model is downloaded — try the ONNX/WASM
      // runtime (downloads on first use) before degrading to the deterministic
      // stub, so `npm install` + `vectalon feature` works with zero setup.
      if (this.zeroConfigEnabled()) {
        return this.getWasmProvider().generate(request)
      }
      return this.localProvider.generate(request)
    }

    const remoteProvider = this.remoteProviders.get(this.provider)
    if (remoteProvider) {
      return remoteProvider.generate(request)
    }

    throw new Error(`No provider available for: ${this.provider}`)
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

  private getWasmProvider(): WasmProvider {
    if (!this.wasmProvider) {
      this.wasmProvider = this.injectedWasmProvider || new WasmProvider({ projectRoot: this.projectRoot })
    }
    return this.wasmProvider
  }
}
