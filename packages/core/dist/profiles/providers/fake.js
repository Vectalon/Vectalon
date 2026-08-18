"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.FakeModelProvider = void 0;
exports.createAlwaysResponds = createAlwaysResponds;
exports.createToolCaller = createToolCaller;
const ModelProvider_1 = require("../ModelProvider");
// ─── FakeModelProvider ─────────────────────────────────────────────────────
/**
 * Deterministic model provider for testing.
 *
 * Records all calls, returns pre-configured responses,
 * and can simulate various failure modes.
 */
class FakeModelProvider {
    id;
    name;
    /** All requests made to this provider (for test assertions). */
    calls = [];
    /** Number of times generate() has been called. */
    get callCount() {
        return this.calls.length;
    }
    responseQueue;
    caps;
    config;
    constructor(config = {}) {
        this.id = config.id ?? 'fake';
        this.name = config.name ?? 'Fake Model Provider';
        this.config = config;
        this.responseQueue = config.responses ? [...config.responses] : [];
        this.caps = {
            toolCalling: config.capabilities?.toolCalling ?? true,
            structuredOutput: config.capabilities?.structuredOutput ?? true,
            vision: config.capabilities?.vision ?? true,
            contextWindow: config.capabilities?.contextWindow ?? 128_000,
            maxOutputTokens: config.capabilities?.maxOutputTokens ?? 16_384,
            streaming: config.capabilities?.streaming ?? true,
            family: config.capabilities?.family ?? 'fake',
        };
    }
    capabilities() {
        return { ...this.caps };
    }
    async generate(request) {
        this.calls.push(request);
        const callNum = this.calls.length;
        // Simulate rate limit
        if (this.config.rateLimitOnCall !== undefined && callNum === this.config.rateLimitOnCall) {
            throw new ModelProvider_1.ModelRateLimitError(this.id, this.config.retryAfterMs);
        }
        // Simulate error
        if (this.config.throwOnCall !== undefined && callNum === this.config.throwOnCall) {
            throw this.config.errorToThrow ?? new ModelProvider_1.ModelProviderError('Simulated failure', this.id);
        }
        // Consume next response from queue
        const template = this.responseQueue?.shift();
        const content = template?.content ?? 'Fake model response';
        const toolCalls = (template?.toolCalls ?? []).map((tc, i) => ({
            id: tc.id ?? `call_${callNum}_${i}`,
            name: tc.name,
            arguments: tc.arguments,
        }));
        const usage = {
            promptTokens: template?.usage?.promptTokens ?? estimateTokens(JSON.stringify(request.messages)),
            completionTokens: template?.usage?.completionTokens ?? estimateTokens(content),
            totalTokens: 0,
        };
        usage.totalTokens = usage.promptTokens + usage.completionTokens;
        const message = {
            role: 'assistant',
            content,
        };
        return {
            message,
            toolCalls,
            usage,
            stopReason: template?.stopReason ?? (toolCalls.length > 0 ? 'tool_calls' : 'stop'),
            latencyMs: this.config.latencyMs ?? 0,
            model: this.config.model ?? 'fake-model',
            metadata: { fake: true, callNum },
        };
    }
    /**
     * Stream a response. Falls back to generate() if no stream chunks configured.
     */
    async *stream(request) {
        this.calls.push(request);
        if (this.config.streamChunks) {
            for (const chunk of this.config.streamChunks) {
                yield { ...chunk };
            }
            return;
        }
        // Fall back: yield the generate() result as a single chunk
        const result = await this.generate(request);
        // Remove the duplicate call count since generate() already recorded it
        this.calls.pop();
        yield {
            content: result.message.content,
            done: true,
            usage: result.usage,
        };
    }
}
exports.FakeModelProvider = FakeModelProvider;
// ─── Helpers ───────────────────────────────────────────────────────────────
/**
 * Rough token estimate (4 chars per token).
 * Good enough for tests; real providers use proper tokenizers.
 */
function estimateTokens(text) {
    return Math.ceil(text.length / 4);
}
/**
 * Create a simple FakeModelProvider that always returns the same text.
 */
function createAlwaysResponds(text) {
    return new FakeModelProvider({
        responses: Array.from({ length: 100 }, () => ({ content: text })),
    });
}
/**
 * Create a FakeModelProvider that simulates tool calls.
 */
function createToolCaller(tools, finalResponse) {
    const responses = tools.map(t => ({
        content: '',
        toolCalls: [{ name: t.name, arguments: t.arguments }],
    }));
    if (finalResponse) {
        responses.push({ content: finalResponse, toolCalls: [] });
    }
    return new FakeModelProvider({ responses });
}
