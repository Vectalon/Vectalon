/**
 * Circuit breaker for model providers.
 *
 * Every generation attempt that ends in a provider failure (remote API down,
 * WASM runtime broken, native module crash) is recorded per provider id. After
 * `maxFailures` failures inside a rolling `windowMs`, the provider's circuit
 * opens for `cooldownMs` — subsequent requests skip it entirely and fall
 * through to the next rung of the ModelRouter fallback chain, so a dead
 * provider can never wedge the harness. When the cooldown expires the circuit
 * goes half-open: the next request is allowed through as a trial; a success
 * closes the circuit, a failure re-opens it immediately.
 *
 * The clock is injectable (`now`) so tests can fast-forward past the window
 * and cooldown deterministically.
 */

export type CircuitState = 'closed' | 'open' | 'half-open'

export interface CircuitBreakerOptions {
  /** Failures inside the window that trip the breaker (default 3). */
  maxFailures?: number
  /** Sliding failure window in ms (default 60s). */
  windowMs?: number
  /** How long an open circuit stays open (default 5 min). */
  cooldownMs?: number
  /** Injectable clock for deterministic tests. */
  now?: () => number
}

export interface CircuitSnapshot {
  provider: string
  state: CircuitState
  /** Failures inside the current window. */
  failures: number
  /** When the circuit is open: the earliest moment it may be tried again. */
  openUntil: number | null
  /** Total failures recorded (never reset, for diagnostics). */
  totalFailures: number
}

export const DEFAULT_CIRCUIT_OPTIONS: Required<Omit<CircuitBreakerOptions, 'now'>> = {
  maxFailures: 3,
  windowMs: 60_000,
  cooldownMs: 300_000,
}

/**
 * Per-provider circuit breaker shared by the ModelRouter fallback chain.
 * Instances are cheap and stateful; create one per router (or inject a shared
 * one for tests).
 */
export class CircuitBreaker {
  private readonly maxFailures: number
  private readonly windowMs: number
  private readonly cooldownMs: number
  private readonly now: () => number
  /** provider → failure timestamps inside the current window. */
  private failures = new Map<string, number[]>()
  /** provider → total failures (diagnostics only, never pruned). */
  private totalFailures = new Map<string, number>()
  /** provider → ms timestamp when an open circuit may be tried again. */
  private openUntil = new Map<string, number>()

  constructor(options: CircuitBreakerOptions = {}) {
    this.maxFailures = options.maxFailures ?? DEFAULT_CIRCUIT_OPTIONS.maxFailures
    this.windowMs = options.windowMs ?? DEFAULT_CIRCUIT_OPTIONS.windowMs
    this.cooldownMs = options.cooldownMs ?? DEFAULT_CIRCUIT_OPTIONS.cooldownMs
    this.now = options.now || (() => Date.now())
  }

  /** Record a failed generation for a provider; may trip the breaker. */
  recordFailure(provider: string): void {
    const t = this.now()
    const until = this.openUntil.get(provider)
    // A failure during a half-open trial re-opens the circuit immediately
    // (the cooldown restarts), rather than waiting for maxFailures again.
    const wasHalfOpen = until !== undefined && t >= until
    const recent = (this.failures.get(provider) || []).filter(ts => t - ts < this.windowMs)
    recent.push(t)
    this.failures.set(provider, recent)
    this.totalFailures.set(provider, (this.totalFailures.get(provider) || 0) + 1)
    if (wasHalfOpen || (recent.length >= this.maxFailures && until === undefined)) {
      this.openUntil.set(provider, t + this.cooldownMs)
    }
  }

  /** Record a successful generation; closes the circuit (if it was open). */
  recordSuccess(provider: string): void {
    this.failures.delete(provider)
    this.openUntil.delete(provider)
  }

  /**
   * Whether the provider is currently short-circuited. When the cooldown has
   * elapsed the circuit is half-open: isOpen returns false so the next request
   * is allowed through as a trial (a success closes it, a failure re-opens it).
   */
  isOpen(provider: string): boolean {
    const until = this.openUntil.get(provider)
    if (until === undefined) return false
    return this.now() < until
  }

  /** Clear all state for a provider (e.g. on explicit retry). */
  reset(provider: string): void {
    this.failures.delete(provider)
    this.openUntil.delete(provider)
  }

  /** Current state for a provider (observability / health). */
  snapshot(provider: string): CircuitSnapshot {
    const t = this.now()
    const recent = (this.failures.get(provider) || []).filter(ts => t - ts < this.windowMs)
    const until = this.openUntil.get(provider)
    let state: CircuitState = 'closed'
    if (until !== undefined) {
      state = t < until ? 'open' : 'half-open'
    }
    return {
      provider,
      state,
      failures: recent.length,
      openUntil: until ?? null,
      totalFailures: this.totalFailures.get(provider) || 0,
    }
  }
}
