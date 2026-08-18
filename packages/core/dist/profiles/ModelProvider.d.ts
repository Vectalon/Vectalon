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
/**
 * What a model can do. Used for feature detection and routing.
 * Providers declare their capabilities; consumers check before using features.
 */
export interface ModelCapabilities {
    /** Model supports tool/function calling */
    toolCalling: boolean;
    /** Model supports structured output (JSON mode, function schemas) */
    structuredOutput: boolean;
    /** Model supports image/vision input */
    vision: boolean;
    /** Context window size in tokens */
    contextWindow: number;
    /** Maximum output tokens */
    maxOutputTokens: number;
    /** Whether the model supports streaming responses */
    streaming: boolean;
    /** Model family/provider for routing decisions */
    family?: string;
}
/** A single message in a conversation. */
export interface ModelMessage {
    /** Role: system, user, assistant, or tool */
    role: 'system' | 'user' | 'assistant' | 'tool';
    /** Text content of the message */
    content: string;
    /** Optional name for the message (for tool results) */
    name?: string;
    /** Tool call ID for tool-role messages */
    toolCallId?: string;
}
/**
 * A tool the model can call. Follows OpenAI-style function calling format.
 */
export interface ModelTool {
    /** Tool name */
    name: string;
    /** Description of what the tool does */
    description: string;
    /** JSON Schema for the tool's input parameters */
    parameters: Record<string, unknown>;
}
/**
 * A tool call requested by the model.
 */
export interface ModelToolCall {
    /** Unique ID for this tool call */
    id: string;
    /** Name of the tool to call */
    name: string;
    /** Arguments as a JSON string */
    arguments: string;
}
/**
 * A request to a model provider.
 */
export interface ModelRequest {
    /** Conversation messages */
    messages: ModelMessage[];
    /** Optional tools the model can use */
    tools?: ModelTool[];
    /** Maximum tokens to generate. Provider may override. */
    maxTokens?: number;
    /**
     * Sampling temperature (0 = deterministic, 1 = creative).
     * Default: 0 for code generation tasks.
     */
    temperature?: number;
    /** Stop sequences */
    stop?: string[];
    /**
     * Provider-specific options. Providers can define their own extensions
     * here without changing the interface.
     */
    metadata?: Record<string, unknown>;
}
/**
 * A response from a model provider.
 */
export interface ModelResponse {
    /** The model's reply message */
    message: ModelMessage;
    /** Tool calls requested by the model (if any) */
    toolCalls: ModelToolCall[];
    /** Token usage */
    usage: ModelUsage;
    /** Whether the response was stopped by a stop sequence */
    stopReason: 'stop' | 'length' | 'tool_calls' | 'content_filter' | 'error';
    /** Provider-specific finish details */
    finishReason?: string;
    /** Response latency in milliseconds */
    latencyMs?: number;
    /** Model that actually answered (may differ from requested) */
    model?: string;
    /**
     * Provider-specific metadata (request ID, safety ratings, etc.)
     */
    metadata?: Record<string, unknown>;
}
/**
 * Token usage breakdown.
 */
export interface ModelUsage {
    /** Tokens in the prompt */
    promptTokens: number;
    /** Tokens generated */
    completionTokens: number;
    /** Total tokens used */
    totalTokens: number;
}
/**
 * ModelProvider — the core abstraction for model access.
 *
 * Every model provider (OpenAI, Anthropic, local Qwen, etc.) implements
 * this interface. The rest of Vectalon depends only on this interface,
 * never on concrete provider implementations.
 *
 * ## Implementation Contract
 *
 * - `id` must be unique across all registered providers
 * - `capabilities()` must be deterministic (no side effects)
 * - `generate()` must be idempotent for the same request
 * - `generate()` must throw `ModelProviderError` on failure
 * - Providers should implement `close()` for cleanup
 */
export interface ModelProvider {
    /** Unique provider identifier (e.g., 'openai', 'anthropic', 'local-qwen') */
    readonly id: string;
    /** Human-readable name */
    readonly name: string;
    /** Declare what this provider/model can do */
    capabilities(): ModelCapabilities;
    /**
     * Generate a response from the model.
     *
     * @param request - The request to send
     * @returns The model's response
     * @throws {ModelProviderError} on provider-level failures
     * @throws {ModelRateLimitError} when rate limited
     */
    generate(request: ModelRequest): Promise<ModelResponse>;
    /**
     * Optional: stream a response. If not implemented, falls back to generate().
     * Useful for long code generation tasks.
     */
    stream?(request: ModelRequest): AsyncIterable<ModelStreamChunk>;
    /**
     * Clean up resources (connections, file handles, etc.).
     * Called when the provider is no longer needed.
     */
    close?(): Promise<void>;
}
/**
 * A chunk of a streamed response.
 */
export interface ModelStreamChunk {
    /** Delta text content */
    content?: string;
    /** Delta tool calls */
    toolCalls?: Partial<ModelToolCall>[];
    /** Whether this is the final chunk */
    done: boolean;
    /** Usage info (only in final chunk) */
    usage?: ModelUsage;
}
/**
 * Provider-level error (network, auth, model unavailable, etc.)
 */
export declare class ModelProviderError extends Error {
    readonly providerId: string;
    readonly cause?: Error | undefined;
    constructor(message: string, providerId: string, cause?: Error | undefined);
}
/**
 * Rate limit error — signals the caller to back off.
 */
export declare class ModelRateLimitError extends ModelProviderError {
    readonly retryAfterMs?: number | undefined;
    constructor(providerId: string, retryAfterMs?: number | undefined);
}
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
export declare class ModelProviderRegistry {
    private providers;
    /**
     * Register a model provider.
     * @throws Error if a provider with the same id is already registered
     */
    register(provider: ModelProvider): void;
    /**
     * Register or replace a provider (hot-swap).
     * Returns the previously registered provider, if any.
     */
    replace(provider: ModelProvider): ModelProvider | undefined;
    /**
     * Look up a provider by id. Returns undefined if not found.
     */
    get(id: string): ModelProvider | undefined;
    /**
     * Look up a provider by id. Throws if not found.
     */
    require(id: string): ModelProvider;
    /**
     * Check if a provider is registered.
     */
    has(id: string): boolean;
    /**
     * List all registered provider ids.
     */
    ids(): string[];
    /**
     * List all registered providers.
     */
    all(): ModelProvider[];
    /**
     * Find providers that support a specific capability.
     */
    withCapability(capability: keyof ModelCapabilities): ModelProvider[];
    /**
     * Find the best provider for a request based on required capabilities.
     * Returns providers sorted by fit (most capable first).
     */
    findBest(requirements: {
        toolCalling?: boolean;
        structuredOutput?: boolean;
        vision?: boolean;
        minContextWindow?: number;
    }): ModelProvider | undefined;
    /**
     * Unregister a provider.
     * Returns the removed provider, if any.
     */
    unregister(id: string): ModelProvider | undefined;
    /**
     * Remove all registered providers.
     */
    clear(): void;
}
/**
 * Global default registry instance.
 * Import and use directly, or create your own for isolation.
 */
export declare const modelProviders: ModelProviderRegistry;
