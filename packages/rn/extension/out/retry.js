"use strict";
/**
 * Retry with exponential backoff — pure helpers for the extension's
 * connection resilience (P0-8). Deliberately vscode-free so the schedule and
 * the retry loop are unit-testable in the host repo.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.backoffDelays = backoffDelays;
exports.withRetries = withRetries;
exports.withTimeout = withTimeout;
/** Exponential backoff delays (ms) for `attempts` total tries (1 + retries). */
function backoffDelays(attempts, baseMs = 1_000) {
    const delays = [];
    for (let i = 0; i < Math.max(0, attempts - 1); i++) {
        delays.push(baseMs * 2 ** i);
    }
    return delays;
}
/**
 * Run `fn` up to `attempts` times, waiting `delays[i]` ms between tries.
 * Returns the first success; throws the last error when all attempts fail.
 */
async function withRetries(fn, options = {}) {
    const attempts = options.attempts ?? 3;
    const delays = options.delays ?? backoffDelays(attempts, options.baseMs ?? 1_000);
    const sleep = options.sleep ?? ((ms) => new Promise(resolve => setTimeout(resolve, ms)));
    const log = options.log;
    let lastError;
    for (let attempt = 1; attempt <= attempts; attempt++) {
        try {
            return await fn();
        }
        catch (error) {
            lastError = error;
            const retryable = options.shouldRetry ? options.shouldRetry(error, attempt) : true;
            const delay = delays[attempt - 1];
            if (attempt < attempts && retryable && delay !== undefined) {
                log?.(`${options.label ?? 'operation'} attempt ${attempt}/${attempts} failed (${error instanceof Error ? error.message : String(error)}) — retrying in ${delay}ms`);
                await sleep(delay);
            }
            else {
                if (attempt < attempts && !retryable) {
                    log?.(`${options.label ?? 'operation'} attempt ${attempt}/${attempts} failed with a non-retryable error — giving up`);
                }
                break;
            }
        }
    }
    throw lastError;
}
/** Bound a promise with a wall-clock timeout; rejects with a clear error. */
function withTimeout(promise, ms, label = 'operation') {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
        promise.then(value => {
            clearTimeout(timer);
            resolve(value);
        }, error => {
            clearTimeout(timer);
            reject(error);
        });
    });
}
//# sourceMappingURL=retry.js.map