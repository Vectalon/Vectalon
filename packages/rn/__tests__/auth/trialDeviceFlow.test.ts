import { pollTrialDeviceFlow, startTrialDeviceFlow } from '../../src/auth/trialDeviceFlow'

const response = (status: number, body: unknown) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
}) as Response
const DEVICE_CODE = 'd'.repeat(40)

describe('trial device flow client', () => {
  test('accepts a bounded server authorization challenge', async () => {
    const fetcher = jest.fn(async () => response(200, {
      deviceCode: DEVICE_CODE, userCode: 'ABCD-EFGH', verificationUri: 'https://github.com/login/device', expiresIn: 900, interval: 5,
    })) as unknown as typeof fetch
    await expect(startTrialDeviceFlow(fetcher, 'https://vectalon.in')).resolves.toEqual({
      deviceCode: DEVICE_CODE, userCode: 'ABCD-EFGH', verificationUri: 'https://github.com/login/device', expiresIn: 900, interval: 5,
    })
    expect(fetcher).toHaveBeenCalledWith('https://vectalon.in/api/v1/trial/device/start', expect.objectContaining({ method: 'POST' }))
  })

  test('normalizes pending, throttled, denied, and successful polling without logging tokens', async () => {
    const bodies = [
      response(202, { status: 'pending' }),
      response(429, { status: 'slow_down', interval: 10 }),
      response(403, { status: 'denied' }),
      response(200, { status: 'complete', credential: 'signed.trial.token' }),
    ]
    const fetcher = jest.fn(async () => bodies.shift()!) as unknown as typeof fetch
    await expect(pollTrialDeviceFlow(fetcher, 'https://vectalon.in', DEVICE_CODE)).resolves.toEqual({ status: 'pending' })
    await expect(pollTrialDeviceFlow(fetcher, 'https://vectalon.in', DEVICE_CODE)).resolves.toEqual({ status: 'slow_down', interval: 10 })
    await expect(pollTrialDeviceFlow(fetcher, 'https://vectalon.in', DEVICE_CODE)).resolves.toEqual({ status: 'denied' })
    await expect(pollTrialDeviceFlow(fetcher, 'https://vectalon.in', DEVICE_CODE)).resolves.toEqual({ status: 'complete', credential: 'signed.trial.token' })
  })

  test('rejects malformed or oversized server responses', async () => {
    const fetcher = jest.fn(async () => response(200, { status: 'complete', credential: 'x'.repeat(20_000) })) as unknown as typeof fetch
    await expect(pollTrialDeviceFlow(fetcher, 'https://vectalon.in', DEVICE_CODE)).rejects.toThrow('trial-response-invalid')
  })
})
