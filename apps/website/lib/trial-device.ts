import { createHash } from 'node:crypto'

export interface TrialDeviceConfig {
  clientId: string
  controlPlaneUrl: string
  controlPlaneSecret: string
}

export interface TrialDeviceChallenge {
  deviceCode: string
  userCode: string
  verificationUri: 'https://github.com/login/device'
  expiresIn: number
  interval: number
}

export type TrialDevicePollResult =
  | { status: 'pending'; httpStatus: 202 }
  | { status: 'slow_down'; interval: number; httpStatus: 429 }
  | { status: 'denied'; httpStatus: 403 }
  | { status: 'expired'; httpStatus: 410 }
  | { status: 'unavailable'; httpStatus: 503 }
  | { status: 'complete'; credential: string; expiresAt: number; httpStatus: 200 }

export async function startDeviceAuthorization(config: TrialDeviceConfig, fetcher: typeof fetch = fetch): Promise<TrialDeviceChallenge> {
  assertConfig(config)
  const response = await fetcher('https://github.com/login/device/code', {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: config.clientId }).toString(),
    signal: AbortSignal.timeout(10_000),
  })
  const body = await json(response)
  if (!response.ok || !validChallenge(body)) throw new Error('trial-service-unavailable')
  return {
    deviceCode: body.device_code,
    userCode: body.user_code,
    verificationUri: body.verification_uri,
    expiresIn: body.expires_in,
    interval: body.interval,
  }
}

export async function pollDeviceAuthorization(deviceCode: string, config: TrialDeviceConfig, fetcher: typeof fetch = fetch): Promise<TrialDevicePollResult> {
  assertConfig(config)
  if (!boundedString(deviceCode, 20, 256)) throw new Error('trial-request-invalid')
  const response = await fetcher('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: config.clientId, device_code: deviceCode, grant_type: 'urn:ietf:params:oauth:grant-type:device_code' }).toString(),
    signal: AbortSignal.timeout(10_000),
  })
  const body = await json(response)
  if (body.error === 'authorization_pending') return { status: 'pending', httpStatus: 202 }
  if (body.error === 'slow_down') return { status: 'slow_down', interval: boundedInteger(body.interval, 5, 60) ? body.interval : 10, httpStatus: 429 }
  if (body.error === 'access_denied') return { status: 'denied', httpStatus: 403 }
  if (body.error === 'expired_token') return { status: 'expired', httpStatus: 410 }
  if (!response.ok || !boundedString(body.access_token, 1, 4096)) return { status: 'unavailable', httpStatus: 503 }

  const issued = await fetcher(`${config.controlPlaneUrl.replace(/\/$/, '')}/api/internal/trials/issue`, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json', authorization: `Bearer ${config.controlPlaneSecret}` },
    body: JSON.stringify({ accessToken: body.access_token, requestId: createHash('sha256').update(deviceCode).digest('hex'), product: 'rn', tier: 'pro' }),
    signal: AbortSignal.timeout(10_000),
  })
  const result = await json(issued)
  if (issued.ok && result.status === 'issued' && boundedString(result.credential, 1, 16_384) && Number.isSafeInteger(result.expiresAt)) {
    return { status: 'complete', credential: result.credential, expiresAt: result.expiresAt, httpStatus: 200 }
  }
  if (issued.status === 403 || issued.status === 409) return { status: 'denied', httpStatus: 403 }
  return { status: 'unavailable', httpStatus: 503 }
}

function assertConfig(config: TrialDeviceConfig): void {
  if (!boundedString(config.clientId, 1, 256) || !boundedString(config.controlPlaneSecret, 32, 4096)) throw new Error('trial-service-unavailable')
  try {
    const url = new URL(config.controlPlaneUrl)
    if (url.protocol !== 'https:') throw new Error()
  } catch { throw new Error('trial-service-unavailable') }
}

async function json(response: Response): Promise<Record<string, any>> {
  try {
    const value: unknown = await response.json()
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {}
  } catch { return {} }
}

function boundedString(value: unknown, min: number, max: number): value is string { return typeof value === 'string' && value.length >= min && value.length <= max }
function boundedInteger(value: unknown, min: number, max: number): value is number { return Number.isSafeInteger(value) && (value as number) >= min && (value as number) <= max }
function validChallenge(value: Record<string, any>): value is Record<string, any> & { device_code: string; user_code: string; verification_uri: 'https://github.com/login/device'; expires_in: number; interval: number } {
  return boundedString(value.device_code, 20, 256) && boundedString(value.user_code, 4, 32)
    && value.verification_uri === 'https://github.com/login/device'
    && boundedInteger(value.expires_in, 60, 1800) && boundedInteger(value.interval, 5, 60)
}
