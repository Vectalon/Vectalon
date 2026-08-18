/**
 * FakeModelProvider — Deterministic test provider
 * Business Source License 1.1 (BSL-1.1)
 *
 * A fully deterministic model provider for unit tests.
 * Returns pre-configured responses, records all calls for assertions,
 * and can simulate errors, rate limits, and streaming.
 *
 * ## Usage
 *
 * ```ts
 * const fake = new FakeModelProvider({
 *   responses: [
 *     { content: 'Fixed the code', toolCalls: [] },
 *   ],
 * })
 *
 * const result = await fake.generate({ messages: [...] })
 * expect(result.message.content).toBe('Fixed the code')
 * expect(fake.calls).toHaveLength(1)
 * ```
 *
 * ## Behavior
 *
 * - Responses are consumed in order (FIFO)
 * - If no responses remain, returns a default response
 * - All requests are recorded in `calls` for assertions
 * - Can be configured to throw on specific call counts
 * - Supports streaming via the `streamResponse` option
 */
import type { ModelProvider, ModelCapabilities, ModelRequest, ModelResponse, ModelStreamChunk, ModelUsage } from '../ModelProvider';
/**
 * Configuration for a FakeModelProvider.
 */
export interface FakeModelProviderConfig {
    /** Provider id (default: 'fake') */
    id?: string;
    /** Provider name (default: 'Fake Model Provider') */
    name?: string;
    /** Capabilities to report (defaults to fully capable) */
    capabilities?: Partial<ModelCapabilities>;
    /**
     * Pre-configured responses. Consumed in order.
     * If empty, the fake returns a default response.
     */
    responses?: Array<{
        content?: string;
        toolCalls?: Array<{
            id?: string;
            name: string;
            arguments: string;
        }>;
        stopReason?: ModelResponse['stopReason'];
        usage?: Partial<ModelUsage>;
    }> | undefined;
    /**
     * Stream chunks for streaming tests. If provided, `stream()` will
     * yield these chunks instead of falling back to generate().
     */
    streamChunks?: ModelStreamChunk[];
    /**
     * If set, throw this error on the Nth call (1-based).
     * Useful for testing error handling.
     */
    throwOnCall?: number;
    errorToThrow?: Error;
    /**
     * If set, return a rate limit error on the Nth call.
     */
    rateLimitOnCall?: number;
    retryAfterMs?: number;
    /** Fixed latency to report in responses (default: 0) */
    latencyMs?: number;
    /** Fixed model name to report (default: 'fake-model') */
    model?: string;
}
/**
 * Deterministic model provider for testing.
 *
 * Records all calls, returns pre-configured responses,
 * and can simulate various failure modes.
 */
export declare class FakeModelProvider implements ModelProvider {
    readonly id: string;
    readonly name: string;
    /** All requests made to this provider (for test assertions). */
    readonly calls: ModelRequest[];
    /** Number of times generate() has been called. */
    get callCount(): number;
    private responseQueue;
    private caps;
    private config;
    constructor(config?: FakeModelProviderConfig);
    capabilities(): ModelCapabilities;
    generate(request: ModelRequest): Promise<ModelResponse>;
    /**
     * Stream a response. Falls back to generate() if no stream chunks configured.
     */
    stream(request: ModelRequest): AsyncIterable<ModelStreamChunk>;
}
/**
 * Create a simple FakeModelProvider that always returns the same text.
 */
export declare function createAlwaysResponds(text: string): FakeModelProvider;
/**
 * Create a FakeModelProvider that simulates tool calls.
 */
export declare function createToolCaller(tools: Array<{
    name: string;
    arguments: string;
}>, finalResponse?: string): FakeModelProvider;
