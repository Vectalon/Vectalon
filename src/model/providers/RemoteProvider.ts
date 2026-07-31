import type { ModelRequest, ModelResponse } from '../types'
import { getConfig } from '../../config'

interface OpenAIResponse {
  choices?: { message?: { content?: string } }[]
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
}

interface AnthropicResponse {
  content?: { text?: string }[]
  usage?: { input_tokens?: number; output_tokens?: number }
}

const PROVIDER_CONFIGS: Record<string, { baseUrl: string; defaultModel: string }> = {
  openai: {
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o',
  },
  anthropic: {
    baseUrl: 'https://api.anthropic.com/v1',
    defaultModel: 'claude-sonnet-4-20250514',
  },
}

export class RemoteProvider {
  private provider: string
  private apiKey: string
  private modelName: string
  private baseUrl: string

  constructor(provider: string) {
    this.provider = provider
    const config = PROVIDER_CONFIGS[provider]
    if (!config) throw new Error(`Unknown provider: ${provider}`)

    this.baseUrl = config.baseUrl
    this.modelName = (getConfig('modelConfig') as { modelName?: string })?.modelName || config.defaultModel
    this.apiKey = (getConfig('modelConfig') as { apiKey?: string })?.apiKey || process.env[`${provider.toUpperCase()}_API_KEY`] || ''
  }

  async generate(request: ModelRequest): Promise<ModelResponse> {
    const context = request.context ? `\nContext:\n${request.context}\n` : ''
    const systemPrompt = request.systemPrompt || 'You are an expert React Native developer assistant.'
    const fullPrompt = `${context}${request.prompt}`

    if (this.provider === 'openai') {
      return this.callOpenAI(systemPrompt, fullPrompt, request)
    }

    if (this.provider === 'anthropic') {
      return this.callAnthropic(systemPrompt, fullPrompt, request)
    }

    throw new Error(`Provider ${this.provider} not fully implemented yet`)
  }

  private async callOpenAI(
    systemPrompt: string,
    prompt: string,
    request: ModelRequest
  ): Promise<ModelResponse> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.modelName,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt },
        ],
        max_tokens: request.maxTokens || 2048,
        temperature: request.temperature ?? 0.3,
      }),
    })

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`)
    }

    const data = (await response.json()) as OpenAIResponse
    return {
      content: data.choices?.[0]?.message?.content || '',
      usage: {
        promptTokens: data.usage?.prompt_tokens,
        completionTokens: data.usage?.completion_tokens,
        totalTokens: data.usage?.total_tokens,
      },
      provider: 'openai',
    }
  }

  private async callAnthropic(
    systemPrompt: string,
    prompt: string,
    request: ModelRequest
  ): Promise<ModelResponse> {
    const response = await fetch(`${this.baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.modelName,
        system: systemPrompt,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: request.maxTokens || 2048,
        temperature: request.temperature ?? 0.3,
      }),
    })

    if (!response.ok) {
      throw new Error(`Anthropic API error: ${response.status} ${response.statusText}`)
    }

    const data = (await response.json()) as AnthropicResponse
    return {
      content: data.content?.[0]?.text || '',
      usage: {
        inputTokens: data.usage?.input_tokens,
        outputTokens: data.usage?.output_tokens,
      },
      provider: 'anthropic',
    }
  }
}
