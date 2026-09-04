import { pollDeviceAuthorization, startDeviceAuthorization } from '../lib/trial-device'

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const config = { clientId: 'github-client', controlPlaneUrl: 'https://admin.vectalon.in', controlPlaneSecret: 's'.repeat(32) }

test('starts GitHub device authorization without requesting repository scopes', async () => {
  const fetcher = jest.fn(async () => json(200, { device_code: 'd'.repeat(40), user_code: 'ABCD-EFGH', verification_uri: 'https://github.com/login/device', expires_in: 900, interval: 5 })) as unknown as typeof fetch
  await expect(startDeviceAuthorization(config, fetcher)).resolves.toEqual({ deviceCode: 'd'.repeat(40), userCode: 'ABCD-EFGH', verificationUri: 'https://github.com/login/device', expiresIn: 900, interval: 5 })
  expect(fetcher).toHaveBeenCalledWith('https://github.com/login/device/code', expect.objectContaining({ body: 'client_id=github-client' }))
})

test('maps GitHub pending and slow-down responses without contacting Admin', async () => {
  const fetcher = jest.fn()
    .mockResolvedValueOnce(json(200, { error: 'authorization_pending' }))
    .mockResolvedValueOnce(json(200, { error: 'slow_down', interval: 10 })) as unknown as typeof fetch
  await expect(pollDeviceAuthorization('d'.repeat(40), config, fetcher)).resolves.toEqual({ status: 'pending', httpStatus: 202 })
  await expect(pollDeviceAuthorization('d'.repeat(40), config, fetcher)).resolves.toEqual({ status: 'slow_down', interval: 10, httpStatus: 429 })
  expect(fetcher).toHaveBeenCalledTimes(2)
})

test('revalidates GitHub access through Admin and never returns provider token', async () => {
  const fetcher = jest.fn()
    .mockResolvedValueOnce(json(200, { access_token: 'github-provider-token', token_type: 'bearer' }))
    .mockResolvedValueOnce(json(200, { status: 'issued', credential: 'signed.trial.credential', expiresAt: 1_900_000_000_000 })) as unknown as typeof fetch
  const result = await pollDeviceAuthorization('d'.repeat(40), config, fetcher)
  expect(result).toEqual({ status: 'complete', credential: 'signed.trial.credential', expiresAt: 1_900_000_000_000, httpStatus: 200 })
  expect(JSON.stringify(result)).not.toContain('github-provider-token')
  expect(fetcher).toHaveBeenLastCalledWith('https://admin.vectalon.in/api/internal/trials/issue', expect.objectContaining({ headers: expect.objectContaining({ authorization: `Bearer ${'s'.repeat(32)}` }) }))
})

test('fails closed when identity authority is not configured', async () => {
  await expect(startDeviceAuthorization({ ...config, clientId: '' }, fetch)).rejects.toThrow('trial-service-unavailable')
})
