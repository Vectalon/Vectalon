import { CircuitBreaker } from '../../src/model/circuitBreaker'

describe('CircuitBreaker', () => {
  function makeClock(initial = 0) {
    let t = initial
    return {
      now: () => t,
      advance: (ms: number): void => {
        t += ms
      },
    }
  }

  it('starts closed with zero failures', () => {
    const clock = makeClock()
    const cb = new CircuitBreaker({ now: clock.now })
    const snap = cb.snapshot('openai')
    expect(snap.state).toBe('closed')
    expect(snap.failures).toBe(0)
    expect(cb.isOpen('openai')).toBe(false)
  })

  it('opens after maxFailures failures inside the window', () => {
    const clock = makeClock()
    const cb = new CircuitBreaker({ maxFailures: 3, windowMs: 60_000, cooldownMs: 300_000, now: clock.now })
    cb.recordFailure('openai')
    cb.recordFailure('openai')
    expect(cb.isOpen('openai')).toBe(false)
    cb.recordFailure('openai')
    expect(cb.isOpen('openai')).toBe(true)
    const snap = cb.snapshot('openai')
    expect(snap.state).toBe('open')
    expect(snap.failures).toBe(3)
    expect(snap.openUntil).toBe(300_000)
  })

  it('forgets failures older than the window', () => {
    const clock = makeClock()
    const cb = new CircuitBreaker({ maxFailures: 3, windowMs: 60_000, cooldownMs: 300_000, now: clock.now })
    cb.recordFailure('openai') // t=0
    cb.recordFailure('openai') // t=0
    clock.advance(61_000)
    // Old failures fell out of the window; one new failure is not enough.
    cb.recordFailure('openai')
    expect(cb.isOpen('openai')).toBe(false)
    expect(cb.snapshot('openai').failures).toBe(1)
  })

  it('short-circuits for the cooldown then goes half-open on the next check', () => {
    const clock = makeClock()
    const cb = new CircuitBreaker({ maxFailures: 3, windowMs: 60_000, cooldownMs: 300_000, now: clock.now })
    cb.recordFailure('openai')
    cb.recordFailure('openai')
    cb.recordFailure('openai')
    expect(cb.isOpen('openai')).toBe(true)
    clock.advance(300_000)
    // Cooldown elapsed → isOpen transitions to half-open (trial allowed).
    expect(cb.isOpen('openai')).toBe(false)
    expect(cb.snapshot('openai').state).toBe('half-open')
  })

  it('closes on success and re-opens immediately on a half-open failure', () => {
    const clock = makeClock()
    const cb = new CircuitBreaker({ maxFailures: 3, windowMs: 60_000, cooldownMs: 300_000, now: clock.now })
    cb.recordFailure('openai')
    cb.recordFailure('openai')
    cb.recordFailure('openai')
    clock.advance(300_000)

    // Half-open trial succeeds → closed.
    cb.recordSuccess('openai')
    expect(cb.isOpen('openai')).toBe(false)
    expect(cb.snapshot('openai').state).toBe('closed')

    // A fresh failure while half-open re-opens it immediately (trial failed).
    cb.recordFailure('openai')
    cb.recordFailure('openai')
    cb.recordFailure('openai')
    expect(cb.isOpen('openai')).toBe(true)
  })

  it('tracks total failures for diagnostics', () => {
    const clock = makeClock()
    const cb = new CircuitBreaker({ now: clock.now })
    cb.recordFailure('local')
    cb.recordFailure('local')
    cb.recordSuccess('local')
    cb.recordFailure('local')
    // Success resets the window count, not the total.
    expect(cb.snapshot('local').failures).toBe(1)
    expect(cb.snapshot('local').totalFailures).toBe(3)
  })

  it('reset clears provider state', () => {
    const clock = makeClock()
    const cb = new CircuitBreaker({ maxFailures: 1, now: clock.now })
    cb.recordFailure('wasm')
    expect(cb.isOpen('wasm')).toBe(true)
    cb.reset('wasm')
    expect(cb.isOpen('wasm')).toBe(false)
    expect(cb.snapshot('wasm').failures).toBe(0)
  })
})
