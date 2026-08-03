import { getConfig } from '../config'
import { LocalProvider } from './providers/LocalProvider'
import { RemoteProvider } from './providers/RemoteProvider'
import type { ModelConfig, ModelRequest, ModelResponse, ModelProviderType } from './types'

export class ModelRouter {
  private provider: ModelProviderType = 'local'
  private localProvider: LocalProvider | null = null
  private remoteProviders: Map<string, RemoteProvider> = new Map()

  /**
   * @param config provider choice plus optional project-level model settings
   *   (modelName / apiKeyEnv from .vectalon/rn-vectalon.json via init).
   */
  initialize(config?: Partial<ModelConfig>): void {
    this.provider = config?.provider || (getConfig('modelProvider') as ModelProviderType) || 'local'

    if (this.provider === 'local') {
      this.localProvider = new LocalProvider()
      void this.localProvider.initialize()
    } else {
      this.remoteProviders.set(this.provider, new RemoteProvider(this.provider, {
        modelName: config?.modelName,
        apiKeyEnv: config?.apiKeyEnv,
      }))
    }
  }

  async generate(request: ModelRequest): Promise<ModelResponse> {
    if (this.provider === 'local' && this.localProvider) {
      return this.localProvider.generate(request)
    }

    const remoteProvider = this.remoteProviders.get(this.provider)
    if (remoteProvider) {
      return remoteProvider.generate(request)
    }

    throw new Error(`No provider available for: ${this.provider}`)
  }

  async getProviderStatus(): Promise<Record<string, boolean>> {
    return {
      local: this.localProvider?.isReady() ?? false,
      openai: this.remoteProviders.has('openai'),
      anthropic: this.remoteProviders.has('anthropic'),
    }
  }

  isLocalFallback(): boolean {
    return this.provider === 'local' && this.localProvider?.isFallback() === true
  }
}
