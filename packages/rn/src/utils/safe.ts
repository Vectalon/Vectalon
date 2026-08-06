/**
 * Unified error handling — replaces the historic bare `catch {}` swallow.
 *
 * Three layers, all logging through src/cli/logger.ts:
 *
 *  - `safe` / `safeAsync` return a `Result<T, E>` so callers can branch on
 *    success vs. failure while still having access to the error value.
 *  - `bestEffort` / `bestEffortAsync` run a probe or side effect and return
 *    `undefined` on failure (with the failure logged contextually).
 *  - `reportError` converts a `catch` block into a contextual log line
 *    instead of silently swallowing the error.
 *
 * `reportError` defaults to the debug level (visible with VECTALON_DEBUG=1)
 * so expected, high-frequency probe failures stay quiet in normal operation
 * while remaining inspectable; pass `'warn'` for genuinely exceptional
 * failures that operators should see by default.
 */
import { logger } from '../cli/logger'

export type Result<T, E = Error> = { ok: true; value: T } | { ok: false; error: E }

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value }
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error }
}

/** Normalize an unknown thrown value into an Error. */
export function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}

/** Log a caught error contextually. Never throws. */
export function reportError(error: unknown, context: string, level: 'debug' | 'warn' = 'debug'): void {
  const message = `${context}: ${toError(error).message}`
  // Logging itself is routed through safe() (no context, so a failure here
  // cannot recurse) — a broken stderr sink must never mask the original error.
  safe(() => {
    if (level === 'warn') {
      logger.warn(message)
    } else {
      logger.debug(message)
    }
  })
}

/** Run `fn`; never throws — returns a Result instead. */
export function safe<T>(fn: () => T, context?: string): Result<T, Error> {
  try {
    return ok(fn())
  } catch (error) {
    if (context) reportError(error, context)
    return err(toError(error))
  }
}

/** Await `fn`; never rejects — returns a Result instead. */
export async function safeAsync<T>(fn: () => Promise<T>, context?: string): Promise<Result<T, Error>> {
  try {
    return ok(await fn())
  } catch (error) {
    if (context) reportError(error, context)
    return err(toError(error))
  }
}

/** Run `fn`, logging failures contextually; returns undefined on throw. */
export function bestEffort<T>(fn: () => T, context: string): T | undefined {
  const result = safe(fn, context)
  return result.ok ? result.value : undefined
}

/** Await `fn`, logging failures contextually; returns undefined on throw. */
export async function bestEffortAsync<T>(fn: () => Promise<T>, context: string): Promise<T | undefined> {
  const result = await safeAsync(fn, context)
  return result.ok ? result.value : undefined
}
