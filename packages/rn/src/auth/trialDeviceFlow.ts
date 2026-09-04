export interface TrialDeviceChallenge {
  deviceCode: string
  userCode: string
  verificationUri: string
  expiresIn: number
  interval: number
}

export type TrialPollResult =
  | { status: 'pending' }
  | { status: 'slow_down'; interval: number }
  | { status: 'denied' | 'expired' | 'unavailable' }
  | { status: 'complete'; credential: string }

export async function startTrialDeviceFlow(fetcher: typeof fetch, origin: string): Promise<TrialDeviceChallenge> {
  const result = await fetcher(`${cleanOrigin(origin)}/api/v1/trial/device/start`, { method: 'POST', headers: { accept: 'application/json' } })
  const body = await json(result)
  if (!result.ok || !validChallenge(body)) throw new Error(result.status === 503 ? 'trial-service-unavailable' : 'trial-response-invalid')
  return body as unknown as TrialDeviceChallenge
}

export async function pollTrialDeviceFlow(fetcher: typeof fetch, origin: string, deviceCode: string): Promise<TrialPollResult> {
  const result = await fetcher(`${cleanOrigin(origin)}/api/v1/trial/device/poll`, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify({ deviceCode }),
  })
  const body = await json(result)
  if (result.status === 202 && body.status === 'pending') return { status: 'pending' }
  if (result.status === 429 && body.status === 'slow_down' && boundedInteger(body.interval, 5, 60)) return { status: 'slow_down', interval: body.interval }
  if (result.status === 403 && body.status === 'denied') return { status: 'denied' }
  if (result.status === 410 && body.status === 'expired') return { status: 'expired' }
  if (result.status === 503) return { status: 'unavailable' }
  if (result.ok && body.status === 'complete' && typeof body.credential === 'string' && body.credential.length > 0 && body.credential.length <= 16_384) {
    return { status: 'complete', credential: body.credential }
  }
  throw new Error('trial-response-invalid')
}

async function json(response: Response): Promise<Record<string, unknown>> {
  try {
    const value = await response.json()
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
  } catch { return {} }
}

function cleanOrigin(origin: string): string { return origin.replace(/\/$/, '') }
function boundedInteger(value: unknown, min: number, max: number): value is number { return Number.isSafeInteger(value) && (value as number) >= min && (value as number) <= max }
function validChallenge(value: Record<string, unknown>): boolean {
  return typeof value.deviceCode === 'string' && value.deviceCode.length >= 20 && value.deviceCode.length <= 256
    && typeof value.userCode === 'string' && value.userCode.length >= 4 && value.userCode.length <= 32
    && value.verificationUri === 'https://github.com/login/device'
    && boundedInteger(value.expiresIn, 60, 1800)
    && boundedInteger(value.interval, 5, 60)
}
