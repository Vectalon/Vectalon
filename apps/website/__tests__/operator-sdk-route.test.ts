import { POST } from '../app/api/admin/sdk-access/route'
import { issueStoredPlatformSdkLease } from '../lib/admin-lifecycle/generated/operator/control-plane/sdk-postgres'
jest.mock('next/headers', () => ({ cookies: async () => ({ get: (name: string) => name === 'vectalon_operator' ? { value: 't'.repeat(43) } : undefined }) }))
jest.mock('../lib/admin-lifecycle/generated/operator/control-plane/database', () => ({ operatorDatabase: () => ({}) }))
jest.mock('../lib/admin-lifecycle/generated/operator/licenses/signer', () => ({ signerFromEnvironment: () => ({}) }))
jest.mock('../lib/admin-lifecycle/generated/operator/control-plane/sdk-postgres', () => ({ issueStoredPlatformSdkLease: jest.fn() }))
const issue = jest.mocked(issueStoredPlatformSdkLease)
describe('platform SDK access endpoint', () => {
  const previous = { ...process.env }
  beforeEach(() => { process.env.VECTALON_OPERATOR_ORIGIN = 'https://vectalon.in' })
  afterEach(() => { process.env = { ...previous }; issue.mockReset() })
  function request(origin = 'https://vectalon.in') { return new Request('https://vectalon.in/api/admin/sdk-access', { method: 'POST', headers: { origin, 'x-vectalon-csrf': 'browser-csrf', 'content-type': 'application/json' }, body: JSON.stringify({ reason: 'Internal SDK verification', role: 'platform', username: 'bhishaksanyal' }) }) }
  it('delegates eligibility to current audited Admin transaction, never caller roles', async () => {
    issue.mockResolvedValue({ ok: true, credential: 'opaque-signed-lease', expiresAt: Date.now()+300_000 })
    const response = await POST(request())
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(issue).toHaveBeenCalledWith(expect.anything(), expect.stringMatching(/^[a-f0-9]{64}$/), expect.objectContaining({ reason: 'Internal SDK verification', csrf: 'browser-csrf', origin: 'https://vectalon.in', expectedOrigin: 'https://vectalon.in', issuer: 'https://vectalon.in', leaseId: expect.stringMatching(/^operator-/) }), expect.anything())
  })
  it('rejects cross-origin and denied transactions without returning credentials', async () => {
    expect((await POST(request('https://attacker.test'))).status).toBe(403)
    expect(issue).not.toHaveBeenCalled()
    issue.mockResolvedValue({ ok: false, code: 'reauth-required' })
    const response = await POST(request())
    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ ok: false, error: 'reauth-required' })
  })
})
