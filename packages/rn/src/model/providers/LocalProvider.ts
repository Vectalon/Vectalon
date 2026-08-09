import type { ModelRequest, ModelResponse } from '../types'
import { getDefaultPreset } from '../local/presets'
import { runInference, probeNativeModule } from '../local/inference'
import { hasDownloadedModel } from '../local/ModelStore'
import { buildSkillsSystemPrompt, enrichWithSkills } from '../../ecosystem/skills'
import { TOOL_CALL_SCHEMA } from '../toolCalling'
import { RN_CODER_SYSTEM_PROMPT } from '../prompts'
import { logger } from '../../cli/logger'

export interface LocalProviderOptions {
  /**
   * Project root — when set, enabled ecosystem skills
   * (.vectalon/skills/<id>/SKILL.md) are inlined into the system prompt of
   * every local generation so the model follows the project's best practices.
   */
  projectRoot?: string
  /** Injectable skills-to-system-prompt builder (defaults to the ecosystem
   * loader). Tests inject a stub to verify the wiring without touching disk. */
  skillsLoader?: (root: string, systemPrompt?: string) => string | undefined
  /**
   * Injectable node-llama-cpp capability probe (defaults to the real dynamic
   * import). Tests inject a stub to verify the degrade path without loading
   * the native module.
   */
  nativeProbe?: () => Promise<true | 'missing' | 'failed'>
}

export class LocalProvider {
  private initialized = false
  private fallback = false
  private nativeAvailable = false
  private initializePromise: Promise<void> | null = null
  private readonly projectRoot?: string
  private readonly skillsLoader: (root: string, systemPrompt?: string) => string | undefined
  private readonly nativeProbe: () => Promise<true | 'missing' | 'failed'>

  constructor(options: LocalProviderOptions = {}) {
    this.projectRoot = options.projectRoot
    this.skillsLoader = options.skillsLoader || buildSkillsSystemPrompt
    this.nativeProbe = options.nativeProbe || probeNativeModule
  }

  /**
   * Idempotent async init. The provider is marked ready immediately (the
   * deterministic stub always works), while the node-llama-cpp capability
   * probe settles in the background; `generate()` awaits the same promise so
   * the native path is only used when the optional module actually loads.
   */
  initialize(): Promise<void> {
    if (!this.initializePromise) {
      this.initializePromise = (async () => {
        this.initialized = true
        const probe = await this.nativeProbe()
        this.nativeAvailable = probe === true
        if (!this.nativeAvailable) {
          const reason =
            probe === 'missing'
              ? 'node-llama-cpp is not installed (it is an optional dependency; run `npm install node-llama-cpp` to enable local inference)'
              : 'node-llama-cpp failed to load (broken native binary; try `npm rebuild node-llama-cpp`)'
          logger.warn(`Local model unavailable: ${reason}. Using the deterministic stub.`)
        }
      })()
    }
    return this.initializePromise
  }

  async generate(request: ModelRequest): Promise<ModelResponse> {
    if (this.initializePromise) {
      // Settle the capability probe before choosing the inference path, so a
      // fire-and-forget initialize() (from ModelRouter) never races a model
      // call into the native path before the probe finishes.
      await this.initializePromise
    } else {
      await this.initialize()
    }

    // Enrich the system prompt with the project's enabled skills when we know
    // the project root. The enriched prompt flows to both the real inference
    // path and the no-model fallback so the skills are always visible. A
    // caller-provided prompt wins; otherwise the shared RN-focused default
    // steers even a bare generate() call toward idiomatic React Native.
    const systemPrompt = enrichWithSkills(
      this.projectRoot,
      this.skillsLoader,
      request.systemPrompt || RN_CODER_SYSTEM_PROMPT
    )

    const preset = getDefaultPreset()
    // Only attempt native inference when the optional node-llama-cpp module
    // actually loaded AND a model is downloaded; otherwise degrade to the
    // deterministic stub with a clear warning.
    if (this.nativeAvailable && hasDownloadedModel(preset.id)) {
      try {
        const result = await runInference(preset.id, {
          systemPrompt,
          prompt: request.prompt,
          temperature: request.temperature ?? 0.2,
          maxTokens: request.maxTokens || 2048,
          // Tool-enabled requests run in JSON mode so the model can only emit
          // the { tool, arguments } / { answer } envelope the loop parses.
          ...(request.tools && request.tools.length > 0 ? { grammarSchema: TOOL_CALL_SCHEMA } : {}),
        })
        return {
          content: result.content,
          provider: 'local',
        }
      } catch (err) {
        this.fallback = true
        return this.fallbackResponse({ ...request, systemPrompt }, err instanceof Error ? err : undefined)
      }
    }

    this.fallback = true
    return this.fallbackResponse({ ...request, systemPrompt })
  }

  isReady(): boolean {
    return this.initialized
  }

  /** Whether the optional node-llama-cpp native module loaded successfully. */
  isNativeAvailable(): boolean {
    return this.nativeAvailable
  }

  isFallback(): boolean {
    return this.fallback
  }

  private fallbackResponse(request: ModelRequest, err?: Error): ModelResponse {
    const context = request.context ? `\nContext:\n${request.context}\n` : ''
    const system = request.systemPrompt ? `System: ${request.systemPrompt}\n` : ''
    const fullPrompt = `${system}${context}${request.prompt}`

    const reason = this.nativeAvailable
      ? 'no downloaded model or inference failed'
      : 'node-llama-cpp native module unavailable (optional dependency)'
    let warning = `[Local model fallback: ${reason}.]`
    if (err) {
      warning += `\nError: ${err.message}`
    }

    return {
      content: `${warning}\n\n${fullPrompt}`,
      provider: 'local',
    }
  }
}
