"use strict";
/**
 * ModelProvider — Model-agnostic provider abstraction
 * Business Source License 1.1 (BSL-1.1)
 *
 * Defines the interface for pluggable model providers. The Vectalon
 * engineering harness is model-agnostic: the model provides general
 * reasoning/coding capability, and Vectalon provides the specialization
 * (rules, guardrails, profiles) around it.
 *
 * ## Architecture
 *
 * ```
 * ModelProvider
 *   |- Qwen
 *   |- Llama
 *   |- OpenAI
 *   |- Anthropic
 *   |- Azure-hosted models
 *   `- Other supported providers
 * ```
 *
 * ## Design
 *
 * - Language-neutral interface (first implementation in TypeScript)
 * - Provider-specific details hidden behind the interface
 * - Capabilities are declared, not assumed
 * - Streaming is optional (providers may implement it)
 * - Deterministic: same request to same provider should be reproducible
 *   (within temperature=0)
 *
 * ## Usage
 *
 * ```ts
 * const provider: ModelProvider = registry.require('openai')
 * const caps = provider.capabilities()
 *
 * if (caps.toolCalling) {
 *   const response = await provider.generate({
 *     messages: [{ role: 'user', content: 'Fix this code' }],
 *     tools: [myTool],
 *   })
 * }
 * ```
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.modelProviders = exports.ModelProviderRegistry = exports.ModelRateLimitError = exports.ModelProviderError = void 0;
// ─── Errors ────────────────────────────────────────────────────────────────
/**
 * Provider-level error (network, auth, model unavailable, etc.)
 */
class ModelProviderError extends Error {
    providerId;
    cause;
    constructor(message, providerId, cause) {
        super(`[${providerId}] ${message}`);
        this.providerId = providerId;
        this.cause = cause;
        this.name = 'ModelProviderError';
    }
}
exports.ModelProviderError = ModelProviderError;
/**
 * Rate limit error — signals the caller to back off.
 */
class ModelRateLimitError extends ModelProviderError {
    retryAfterMs;
    constructor(providerId, retryAfterMs) {
        super(`Rate limited`, providerId);
        this.retryAfterMs = retryAfterMs;
        this.name = 'ModelRateLimitError';
    }
}
exports.ModelRateLimitError = ModelRateLimitError;
// ─── Provider Registry ─────────────────────────────────────────────────────
/**
 * Registry for model providers.
 *
 * Follows the same plugin pattern as LanguageProfileRegistry,
 * FrameworkProfileRegistry, and PlatformProfileRegistry.
 *
 * ```ts
 * registry.register(openaiProvider)
 * registry.register(anthropicProvider)
 *
 * const provider = registry.require('openai')
 * const response = await provider.generate(request)
 * ```
 */
class ModelProviderRegistry {
    providers = new Map();
    /**
     * Register a model provider.
     * @throws Error if a provider with the same id is already registered
     */
    register(provider) {
        if (this.providers.has(provider.id)) {
            throw new Error(`Provider '${provider.id}' is already registered. ` +
                `Use replace() to hot-swap.`);
        }
        this.providers.set(provider.id, provider);
    }
    /**
     * Register or replace a provider (hot-swap).
     * Returns the previously registered provider, if any.
     */
    replace(provider) {
        const prev = this.providers.get(provider.id);
        this.providers.set(provider.id, provider);
        return prev;
    }
    /**
     * Look up a provider by id. Returns undefined if not found.
     */
    get(id) {
        return this.providers.get(id);
    }
    /**
     * Look up a provider by id. Throws if not found.
     */
    require(id) {
        const provider = this.providers.get(id);
        if (!provider) {
            throw new Error(`Provider '${id}' not found. ` +
                `Available: ${this.ids().join(', ') || '(none)'}`);
        }
        return provider;
    }
    /**
     * Check if a provider is registered.
     */
    has(id) {
        return this.providers.has(id);
    }
    /**
     * List all registered provider ids.
     */
    ids() {
        return Array.from(this.providers.keys());
    }
    /**
     * List all registered providers.
     */
    all() {
        return Array.from(this.providers.values());
    }
    /**
     * Find providers that support a specific capability.
     */
    withCapability(capability) {
        return this.all().filter(p => {
            const caps = p.capabilities();
            return Boolean(caps[capability]);
        });
    }
    /**
     * Find the best provider for a request based on required capabilities.
     * Returns providers sorted by fit (most capable first).
     */
    findBest(requirements) {
        const candidates = this.all().filter(p => {
            const caps = p.capabilities();
            if (requirements.toolCalling && !caps.toolCalling)
                return false;
            if (requirements.structuredOutput && !caps.structuredOutput)
                return false;
            if (requirements.vision && !caps.vision)
                return false;
            if (requirements.minContextWindow && caps.contextWindow < requirements.minContextWindow)
                return false;
            return true;
        });
        // Sort by context window descending (prefer larger models)
        candidates.sort((a, b) => b.capabilities().contextWindow - a.capabilities().contextWindow);
        return candidates[0];
    }
    /**
     * Unregister a provider.
     * Returns the removed provider, if any.
     */
    unregister(id) {
        const provider = this.providers.get(id);
        this.providers.delete(id);
        return provider;
    }
    /**
     * Remove all registered providers.
     */
    clear() {
        this.providers.clear();
    }
}
exports.ModelProviderRegistry = ModelProviderRegistry;
/**
 * Global default registry instance.
 * Import and use directly, or create your own for isolation.
 */
exports.modelProviders = new ModelProviderRegistry();
