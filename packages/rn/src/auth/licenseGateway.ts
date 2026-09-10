/**
 * Deliberately narrow customer gateway for credential refresh.
 *
 * This is the only RN network boundary allowed to carry a stored license
 * credential. It has one production origin, sends credentials in an HTTPS
 * authorization header (never in a URL or request body), follows no redirect,
 * and returns finite, non-sensitive error codes only.
 */

export const PRODUCTION_LICENSE_GATEWAY_ORIGIN = 'https://vectalon.in'
const REFRESH_PATH = '/api/v1/license/refresh'
const DEFAULT_TIMEOUT_MS = 10_000
const MAX_TIMEOUT_MS = 10_000

export type LicenseGatewayFailureCode =
  | 'gateway_not_allowed'
  | 'redirect_blocked'
  | 'timeout'
  | 'offline'
  | 'unauthorized'
  | 'invalid_command'
  | 'invalid_transition'
  | 'not_found'
  | 'revision_conflict'
  | 'idempotency_conflict'
  | 'signing_unavailable'
  | 'service_unavailable'
  | 'contract_invalid'

/** A durable server decision that invalidates every locally recoverable lease. */
export const AUTHORITATIVE_LIFECYCLE_DENIAL_STATES = ['suspended', 'expired', 'canceled', 'refunded', 'revoked', 'superseded'] as const
export type AuthoritativeLifecycleDenialState = typeof AUTHORITATIVE_LIFECYCLE_DENIAL_STATES[number]

export type LicenseGatewayResult =
  | Readonly<{ ok: true; credential: string }>
  | Readonly<{ ok: false; code: LicenseGatewayFailureCode; retryable: boolean; lifecycle?: AuthoritativeLifecycleDenialState }>

type FetchLike = (url: string, init: RequestInit) => Promise<Response>
type Environment = Readonly<Record<string, string | undefined>>

const ADMIN_FAILURES = new Set<LicenseGatewayFailureCode>([
  'unauthorized', 'invalid_command', 'invalid_transition', 'not_found',
  'revision_conflict', 'idempotency_conflict', 'signing_unavailable', 'service_unavailable',
])

/** Production is fixed; a non-production HTTPS test/local origin needs two explicit opt-ins. */
export function resolveLicenseGatewayOrigin(environment: Environment = process.env): Readonly<{ ok: true; origin: string }> | Readonly<{ ok: false; code: 'gateway_not_allowed' }> {
  const configured = environment.VECTALON_LICENSE_GATEWAY_URL?.trim()
  if (!configured) return { ok: true, origin: PRODUCTION_LICENSE_GATEWAY_ORIGIN }
  if (environment.NODE_ENV === 'production' || environment.VECTALON_LICENSE_GATEWAY_ALLOW_OVERRIDE !== '1') return { ok: false, code: 'gateway_not_allowed' }
  try {
    const url = new URL(configured)
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') return { ok: false, code: 'gateway_not_allowed' }
    return { ok: true, origin: url.origin }
  } catch {
    return { ok: false, code: 'gateway_not_allowed' }
  }
}

export class LicenseGatewayClient {
  private readonly fetchImpl: FetchLike
  private readonly origin: ReturnType<typeof resolveLicenseGatewayOrigin>
  private readonly timeoutMs: number

  constructor(options: Readonly<{ fetch?: FetchLike; environment?: Environment; timeoutMs?: number }> = {}) {
    this.fetchImpl = options.fetch ?? fetch
    this.origin = resolveLicenseGatewayOrigin(options.environment)
    this.timeoutMs = boundedTimeout(options.timeoutMs)
  }

  async refresh(credential: string): Promise<LicenseGatewayResult> {
    if (!credential || credential.length > 16_384 || /\s/.test(credential)) return { ok: false, code: 'contract_invalid', retryable: false }
    if (!this.origin.ok) return { ok: false, code: this.origin.code, retryable: false }
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)
    timer.unref?.()
    try {
      const response = await this.fetchImpl(`${this.origin.origin}${REFRESH_PATH}`, {
        method: 'POST',
        headers: { authorization: `Bearer ${credential}`, 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ action: 'refresh' }),
        redirect: 'manual',
        signal: controller.signal,
      })
      if (response.status >= 300 && response.status < 400) return { ok: false, code: 'redirect_blocked', retryable: false }
      if (response.status === 401) return { ok: false, code: 'unauthorized', retryable: false }
      let payload: unknown
      try { payload = await response.json() } catch { return { ok: false, code: 'contract_invalid', retryable: false } }
      return parseGatewayResponse(payload)
    } catch (error) {
      if (isAbort(error)) return { ok: false, code: 'timeout', retryable: true }
      return { ok: false, code: 'offline', retryable: true }
    } finally {
      clearTimeout(timer)
    }
  }
}

function parseGatewayResponse(value: unknown): LicenseGatewayResult {
  if (!isObject(value) || value.contractVersion !== '1.0.0' || typeof value.ok !== 'boolean') return { ok: false, code: 'contract_invalid', retryable: false }
  if (value.ok) return typeof value.credential === 'string' && value.credential.length > 0
    ? { ok: true, credential: value.credential }
    : { ok: false, code: 'contract_invalid', retryable: false }
  if (!isObject(value.error) || typeof value.error.code !== 'string' || typeof value.error.retryable !== 'boolean' || !ADMIN_FAILURES.has(value.error.code as LicenseGatewayFailureCode)) {
    return { ok: false, code: 'contract_invalid', retryable: false }
  }
  const lifecycle = value.error.lifecycle
  if (lifecycle !== undefined && (!AUTHORITATIVE_LIFECYCLE_DENIAL_STATES.includes(lifecycle as AuthoritativeLifecycleDenialState) || value.error.retryable)) {
    return { ok: false, code: 'contract_invalid', retryable: false }
  }
  return { ok: false, code: value.error.code as LicenseGatewayFailureCode, retryable: value.error.retryable,
    ...(lifecycle === undefined ? {} : { lifecycle: lifecycle as AuthoritativeLifecycleDenialState }) }
}

function boundedTimeout(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) return DEFAULT_TIMEOUT_MS
  return Math.min(value, MAX_TIMEOUT_MS)
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isAbort(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}
