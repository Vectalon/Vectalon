import { handleLicenseRefresh } from '../lib/license-refresh-route'
import { durableLifecycleAdapter } from '../lib/lifecycle-gateway'

const credential = 'stored-license-credential'

describe('authenticated license refresh route', () => {
  it('requires a bearer credential and passes only the approved action envelope to the durable lifecycle adapter', async () => {
    const execute = jest.fn(async (input: { action: string; credential: string }) => ({
      contractVersion: '1.0.0', ok: true, replayed: false, license: {}, audit: {}, credential: 'replacement-license-credential',
    }))
    const request = new Request('https://vectalon.in/api/v1/license/refresh', {
      method: 'POST', headers: { authorization: `Bearer ${credential}` }, body: JSON.stringify({ action: 'refresh' }),
    })
    const response = await handleLicenseRefresh(request, durableLifecycleAdapter(execute))
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ contractVersion: '1.0.0', ok: true, credential: 'replacement-license-credential' })
    expect(execute).toHaveBeenCalledWith({ action: 'refresh', credential })
  })

  it('accepts activation without allowing a credential in the request body', async () => {
    const execute = jest.fn(async () => ({ contractVersion: '1.0.0', ok: true, replayed: false, license: {}, audit: {}, credential: 'replacement-license-credential' }))
    const request = new Request('https://vectalon.in/api/v1/license/refresh', {
      method: 'POST', headers: { authorization: `Bearer ${credential}` }, body: JSON.stringify({ action: 'activate' }),
    })
    const response = await handleLicenseRefresh(request, durableLifecycleAdapter(execute))
    expect(response.status).toBe(200)
    expect(execute).toHaveBeenCalledWith({ action: 'activate', credential })
  })

  it('maps a durable lifecycle rejection without echoing the bearer credential', async () => {
    const request = new Request('https://vectalon.in/api/v1/license/refresh', { method: 'POST', headers: { authorization: `Bearer ${credential}` } })
    const response = await handleLicenseRefresh(request, durableLifecycleAdapter(async () => ({ contractVersion: '1.0.0', ok: false, error: { code: 'invalid_transition', message: credential, retryable: false } })))
    expect(response.status).toBe(409)
    const body = await response.text()
    expect(body).not.toContain(credential)
    expect(body).toContain('invalid_transition')
  })

  it('forwards a typed terminal lifecycle denial so customers can immediately disable local access', async () => {
    const request = new Request('https://vectalon.in/api/v1/license/refresh', { method: 'POST', headers: { authorization: `Bearer ${credential}` } })
    const response = await handleLicenseRefresh(request, durableLifecycleAdapter(async () => ({
      contractVersion: '1.0.0', ok: false, error: { code: 'invalid_transition', message: 'revoked by issuer', retryable: false, lifecycle: 'revoked' },
    })))

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({ contractVersion: '1.0.0', ok: false, error: { code: 'invalid_transition', retryable: false, lifecycle: 'revoked' } })
  })

  it('rejects missing credentials and malformed Admin v1 envelopes', async () => {
    const missing = await handleLicenseRefresh(new Request('https://vectalon.in/api/v1/license/refresh', { method: 'POST' }), durableLifecycleAdapter(async () => ({})))
    expect(missing.status).toBe(401)
    const malformed = await handleLicenseRefresh(new Request('https://vectalon.in/api/v1/license/refresh', { method: 'POST', headers: { authorization: `Bearer ${credential}` } }), durableLifecycleAdapter(async () => ({ contractVersion: '2.0.0', ok: true })))
    expect(malformed.status).toBe(502)
  })
})
