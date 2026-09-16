import { POST as issue } from '../app/api/admin/licenses/route'
import { POST as revoke } from '../app/api/admin/licenses/[key]/revoke/route'
import { operatorAuthorization } from '../lib/operator-host'
import { defaultAdminStore } from '../lib/admin-store'
jest.mock('../lib/admin-auth', () => ({ isAdmin: async () => true }))
jest.mock('../lib/operator-host', () => ({ operatorAuthorization: jest.fn() }))
jest.mock('../lib/admin-store', () => { const store = { issueLicense: jest.fn(async () => ({ key: 'customer-key', tier: 'pro' })), revokeLicense: jest.fn(async () => true) }; return { defaultAdminStore: () => store } })
const authorize = jest.mocked(operatorAuthorization)
describe('existing admin mutation guards', () => {
  beforeEach(() => { authorize.mockReset(); jest.clearAllMocks() })
  function request() { return new Request('https://vectalon.in/api/admin/licenses', { method: 'POST', headers: { origin: 'https://vectalon.in', 'content-type': 'application/json', 'x-vectalon-csrf': 'browser-csrf', 'x-vectalon-reason': 'Customer support approval' }, body: JSON.stringify({ email: 'customer@example.com', tier: 'pro' }) }) }
  it('legacy boolean admin status cannot authorize signing or revocation', async () => {
    authorize.mockResolvedValue({ ok: false, code: 'forbidden' })
    expect((await issue(request())).status).toBe(403)
    expect((await revoke(request(), { params: Promise.resolve({ key: 'customer-key' }) })).status).toBe(403)
    expect(defaultAdminStore().issueLicense).not.toHaveBeenCalled()
    expect(defaultAdminStore().revokeLicense).not.toHaveBeenCalled()
  })
  it('unavailable immutable authorization audit denies customer mutation', async () => {
    authorize.mockResolvedValue({ ok: false, code: 'service-unavailable' })
    expect((await issue(request())).status).toBe(503)
    expect(defaultAdminStore().issueLicense).not.toHaveBeenCalled()
  })
})
