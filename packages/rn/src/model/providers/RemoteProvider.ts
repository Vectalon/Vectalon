import type { ModelRequest, ModelResponse } from '../types'
import { getConfig } from '../../config'
import { buildSkillsSystemPrompt, enrichWithSkills } from '../../ecosystem/skills'
import { buildMemorySystemPrompt, enrichWithMemory } from '../../memory'
import { buildWebIntelSystemPrompt, enrichWithIntel } from '../../knowledge/intel'
import { RN_CODER_SYSTEM_PROMPT } from '../prompts'
import { getRemoteProviderInfo } from '../setup'
import type { ProjectModelConfig } from '../setup'

export interface RemoteProviderOptions {
  /**
   * Project root — when set, enabled ecosystem skills
   * (.vectalon/skills/<id>/SKILL.md) are inlined into the system prompt of
   * every remote generation, mirroring the local provider.
   */
  projectRoot?: string
  /** Injectable skills-to-system-prompt builder (defaults to the ecosystem
   * loader). Tests inject a stub to verify the wiring without touching disk. */
  skillsLoader?: (root: string, systemPrompt?: string) => string | undefined
  /** Injectable web-intel-to-system-prompt builder (defaults to the knowledge
   * loader). Tests inject a stub to verify the wiring without touching disk. */
  intelLoader?: (root: string, systemPrompt?: string) => string | undefined
  /** Injectable distilled-memory-to-system-prompt builder (defaults to the
   * memory distiller loader). Tests inject a stub to verify the wiring. */
  memoryLoader?: (root: string, systemPrompt?: string) => string | undefined
}

interface OpenAIResponse {
  choices?: { message?: { content?: string } }[]
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
}

interface AnthropicResponse {
  content?: { text?: string }[]
  usage?: { input_tokens?: number; output_tokens?: number }
}

/**
 * Remote HTTP model provider, driven by the provider registry in
 * `model/setup.ts`. Three wire formats are supported:
 * - `openai` — POST {baseUrl}/chat/completions with Bearer auth (OpenAI,
 *   Groq, and the OpenAI-compatible endpoints of local Ollama/vLLM servers)
 * - `anthropic` — POST {baseUrl}/messages with x-api-key
 * - `azure` — POST {baseUrl}/chat/completions?api-version= with api-key
 *   (the base URL carries the resource + deployment path)
 */
export class RemoteProvider {
  private provider: string
  private label: string
  private kind: 'openai' | 'anthropic' | 'azure'
  private apiVersion?: string
  private apiKey: string
  private modelName: string
  private baseUrl: string
  private readonly projectRoot?: string
  private readonly skillsLoader: (root: string, systemPrompt?: string) => string | undefined
  private readonly intelLoader: (root: string, systemPrompt?: string) => string | undefined
  private readonly memoryLoader: (root: string, systemPrompt?: string) => string | undefined

  /**
   * @param config project-level overrides from .vectalon/rn-vectalon.json
   *   (set by `vectalon init`) — modelName, the env var holding the API key,
   *   and an optional endpoint override (Azure resource/deployment, custom
   *   vLLM/Ollama URLs). Falls back to the global config, then the registry.
   * @param options project root + injectable skills/intel loaders so remote
   *   generations follow the project's enabled skills and current web intel
   *   like the local model.
   */
  constructor(provider: string, config?: ProjectModelConfig, options: RemoteProviderOptions = {}) {
    this.provider = provider
    const info = getRemoteProviderInfo(provider)
    if (!info) throw new Error(`Unknown provider: ${provider}`)

    this.label = info.label
    this.kind = info.kind
    this.apiVersion = info.apiVersion

    const globalConfig = getConfig('modelConfig') as { modelName?: string; apiKey?: string; endpoint?: string } | undefined
    const endpointOverride = config?.endpoint || globalConfig?.endpoint
    this.baseUrl = (endpointOverride || info.baseUrl).replace(/\/+$/, '')
    this.modelName = config?.modelName || globalConfig?.modelName || info.defaultModel
    const keyEnv = config?.apiKeyEnv || info.apiKeyEnv || undefined
    // Keyless providers (ollama/vllm) never inherit a global key — they only
    // send one when an explicit apiKeyEnv is configured for them.
    const keyless = info.apiKeyEnv === null && !config?.apiKeyEnv
    this.apiKey = keyless ? '' : globalConfig?.apiKey || (keyEnv ? process.env[keyEnv] : '') || ''
    this.projectRoot = options.projectRoot
    this.skillsLoader = options.skillsLoader || buildSkillsSystemPrompt
    this.intelLoader = options.intelLoader || buildWebIntelSystemPrompt
    this.memoryLoader = options.memoryLoader || buildMemorySystemPrompt
  }

  async generate(request: ModelRequest): Promise<ModelResponse> {
    const context = request.context ? `\nContext:\n${request.context}\n` : ''
    const baseSystem = request.systemPrompt || RN_CODER_SYSTEM_PROMPT
    // Enrich with the project's enabled skills, distilled memory, and the
    // latest web intel (mirrors LocalProvider) so remote generations follow
    // the same best-practice guidance, learned project knowledge, and
    // current ecosystem decisions.
    const skillsPrompt = enrichWithSkills(this.projectRoot, this.skillsLoader, baseSystem) ?? baseSystem
    const memoryPrompt = enrichWithMemory(this.projectRoot, this.memoryLoader, skillsPrompt) ?? skillsPrompt
    const systemPrompt = enrichWithIntel(this.projectRoot, this.intelLoader, memoryPrompt) ?? memoryPrompt
    const fullPrompt = `${context}${request.prompt}`

    if (this.kind === 'anthropic') {
      return this.callAnthropic(systemPrompt, fullPrompt, request)
    }

    if (this.kind === 'azure') {
      return this.callAzureOpenAI(systemPrompt, fullPrompt, request)
    }

    // openai / groq / ollama / vllm all speak OpenAI chat completions.
    return this.callOpenAI(systemPrompt, fullPrompt, request)
  }

  private async callOpenAI(
    systemPrompt: string,
    prompt: string,
    request: ModelRequest
  ): Promise<ModelResponse> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    // Keyless local servers (Ollama/vLLM) skip the empty bearer header so
    // strict gateways don't reject the request.
    if (this.apiKey) {
      headers.Authorization = `Bearer ${this.apiKey}`
    }
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
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
      throw new Error(`${this.label} API error: ${response.status} ${response.statusText}`)
    }

    const data = (await response.json()) as OpenAIResponse
    return {
      content: data.choices?.[0]?.message?.content || '',
      usage: {
        promptTokens: data.usage?.prompt_tokens,
        completionTokens: data.usage?.completion_tokens,
        totalTokens: data.usage?.total_tokens,
      },
      provider: this.provider,
    }
  }

  /**
   * Azure OpenAI: the deployment name is part of the base URL
   * (`https://<resource>.openai.azure.com/openai/deployments/<deployment>`),
   * auth is the `api-key` header, and every call needs `api-version`.
   */
  private async callAzureOpenAI(
    systemPrompt: string,
    prompt: string,
    request: ModelRequest
  ): Promise<ModelResponse> {
    const apiVersion = this.apiVersion || '2024-06-01'
    // The deployment lives in the URL; don't append a second api-version when
    // the endpoint already carries one.
    const url = /[?&]api-version=/.test(this.baseUrl)
      ? `${this.baseUrl}/chat/completions`
      : `${this.baseUrl}/chat/completions?api-version=${apiVersion}`
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': this.apiKey,
      },
      // Azure derives the deployment from the URL path — the body `model`
      // field is optional and some deployments reject a mismatch, so omit it.
      body: JSON.stringify({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt },
        ],
        max_tokens: request.maxTokens || 2048,
        temperature: request.temperature ?? 0.3,
      }),
    })

    if (!response.ok) {
      throw new Error(`${this.label} API error: ${response.status} ${response.statusText}`)
    }

    const data = (await response.json()) as OpenAIResponse
    return {
      content: data.choices?.[0]?.message?.content || '',
      usage: {
        promptTokens: data.usage?.prompt_tokens,
        completionTokens: data.usage?.completion_tokens,
        totalTokens: data.usage?.total_tokens,
      },
      provider: this.provider,
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
      throw new Error(`${this.label} API error: ${response.status} ${response.statusText}`)
    }

    const data = (await response.json()) as AnthropicResponse
    return {
      content: data.content?.[0]?.text || '',
      usage: {
        inputTokens: data.usage?.input_tokens,
        outputTokens: data.usage?.output_tokens,
      },
      provider: this.provider,
    }
  }
}
