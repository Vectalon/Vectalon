import { LicenseGatewayClient, resolveLicenseGatewayOrigin } from '../../src/auth/licenseGateway'

const credential = 'stored-license-credential'

function response(body: unknown, status = 200): Response {
  return { status, json: async () => body } as unknown as Response
}

const refreshed = {
  contractVersion: '1.0.0', ok: true, replayed: false,
  license: {}, audit: {}, credential: 'replacement-license-credential',
}

describe('customer license gateway', () => {
  it('uses only the fixed production origin unless a local/test HTTPS override is explicitly enabled', () => {
    expect(resolveLicenseGatewayOrigin({})).toEqual({ ok: true, origin: 'https://vectalon.in' })
    expect(resolveLicenseGatewayOrigin({ VECTALON_LICENSE_GATEWAY_URL: 'https://test.vectalon.in' })).toEqual({ ok: false, code: 'gateway_not_allowed' })
    expect(resolveLicenseGatewayOrigin({ VECTALON_LICENSE_GATEWAY_URL: 'http://localhost:3000', VECTALON_LICENSE_GATEWAY_ALLOW_OVERRIDE: '1' })).toEqual({ ok: false, code: 'gateway_not_allowed' })
    expect(resolveLicenseGatewayOrigin({ NODE_ENV: 'production', VECTALON_LICENSE_GATEWAY_URL: 'https://test.vectalon.in', VECTALON_LICENSE_GATEWAY_ALLOW_OVERRIDE: '1' })).toEqual({ ok: false, code: 'gateway_not_allowed' })
    expect(resolveLicenseGatewayOrigin({ NODE_ENV: 'test', VECTALON_LICENSE_GATEWAY_URL: 'https://test.vectalon.in', VECTALON_LICENSE_GATEWAY_ALLOW_OVERRIDE: '1' })).toEqual({ ok: true, origin: 'https://test.vectalon.in' })
  })

  it('forwards the stored credential only as an HTTPS authorization header and never follows redirects', async () => {
    const fetch = jest.fn(async (_url: string, init: RequestInit) => {
      expect(init.redirect).toBe('manual')
      expect(init.headers).toMatchObject({ authorization: `Bearer ${credential}` })
      expect(init.body).not.toContain(credential)
      return response(refreshed)
    })
    const client = new LicenseGatewayClient({ fetch, environment: {} })
    await expect(client.refresh(credential)).resolves.toEqual({ ok: true, credential: 'replacement-license-credential' })
    expect(fetch).toHaveBeenCalledWith('https://vectalon.in/api/v1/license/refresh', expect.any(Object))

    const redirected = new LicenseGatewayClient({ fetch: async () => response({}, 302), environment: {} })
    await expect(redirected.refresh(credential)).resolves.toEqual({ ok: false, code: 'redirect_blocked', retryable: false })
  })

  it('maps timeout, offline, and approved contract failures without exposing the credential', async () => {
    const noHeaderInjection = new LicenseGatewayClient({ fetch: async () => { throw new Error('must not fetch') }, environment: {} })
    await expect(noHeaderInjection.refresh('credential\nattack')).resolves.toEqual({ ok: false, code: 'contract_invalid', retryable: false })

    const timeout = new LicenseGatewayClient({
      fetch: async (_url: string, init: RequestInit) => new Promise((_resolve, reject) => init.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))),
      timeoutMs: 1,
      environment: {},
    })
    await expect(timeout.refresh(credential)).resolves.toEqual({ ok: false, code: 'timeout', retryable: true })

    const offline = new LicenseGatewayClient({ fetch: async () => { throw new TypeError('network down') }, environment: {} })
    await expect(offline.refresh(credential)).resolves.toEqual({ ok: false, code: 'offline', retryable: true })

    for (const code of ['unauthorized', 'invalid_transition', 'service_unavailable'] as const) {
      const client = new LicenseGatewayClient({ fetch: async () => response({ contractVersion: '1.0.0', ok: false, error: { code, message: credential, retryable: code === 'service_unavailable' } }), environment: {} })
      await expect(client.refresh(credential)).resolves.toEqual({ ok: false, code, retryable: code === 'service_unavailable' })
    }
  })
})
