import type { ModelRequest, ModelResponse } from '../types'

export class LocalProvider {
  private modelPath: string
  private initialized = false

  constructor(modelPath: string) {
    this.modelPath = modelPath
  }

  async initialize(): Promise<void> {
    this.initialized = true
  }

  async generate(request: ModelRequest): Promise<ModelResponse> {
    if (!this.initialized) await this.initialize()

    const context = request.context ? `\nContext:\n${request.context}\n` : ''
    const system = request.systemPrompt ? `System: ${request.systemPrompt}\n` : ''
    const fullPrompt = `${system}${context}${request.prompt}`

    return {
      content: `[Local model response]\n${fullPrompt}`,
      provider: 'local',
    }
  }

  isReady(): boolean {
    return this.initialized
  }
}
