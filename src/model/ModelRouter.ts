import { getConfig } from '../config'
import { LocalProvider } from './providers/LocalProvider'
import { RemoteProvider } from './providers/RemoteProvider'
import type { ModelConfig, ModelRequest, ModelResponse, ModelProviderType } from './types'

export class ModelRouter {
  private localProvider: LocalProvider | null = null
  private remoteProviders: Map<string, RemoteProvider> = new Map()

  initialize(config?: Partial<ModelConfig>): void {
    const provider: ModelProviderType = config?.provider || (getConfig('modelProvider') as ModelProviderType) || 'local'

    if (provider === 'local') {
      this.localProvider = new LocalProvider('')
    } else {
      this.remoteProviders.set(provider, new RemoteProvider(provider))
    }
  }

  async generate(request: ModelRequest): Promise<ModelResponse> {
    const provider: ModelProviderType = getConfig('modelProvider') as ModelProviderType || 'local'

    if (provider === 'local' && this.localProvider) {
      return this.localProvider.generate(request)
    }

    const remoteProvider = this.remoteProviders.get(provider)
    if (remoteProvider) {
      return remoteProvider.generate(request)
    }

    throw new Error(`No provider available for: ${provider}`)
  }

  async getProviderStatus(): Promise<Record<string, boolean>> {
    return {
      local: this.localProvider?.isReady() ?? false,
      openai: this.remoteProviders.has('openai'),
      anthropic: this.remoteProviders.has('anthropic'),
    }
  }
}
