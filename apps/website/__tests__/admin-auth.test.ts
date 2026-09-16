import { isAdmin } from '../lib/admin-auth'
import { operatorAuthorization } from '../lib/operator-host'
jest.mock('../lib/operator-host', () => ({ operatorAuthorization: jest.fn() }))
const authorize = jest.mocked(operatorAuthorization)

describe('production admin authentication', () => {
  afterEach(() => {
    delete process.env.ADMIN_PASSWORD
    delete process.env.ADMIN_SESSION_SECRET
    delete process.env.VERCEL_ENV
  })

  it('fails closed when durable session authorization is unavailable', async () => {
    process.env.VERCEL_ENV = 'production'

    authorize.mockResolvedValue({ ok: false, code: 'service-unavailable' })
    expect(await isAdmin()).toBe(false)
  })

  it('never allows configured legacy passwords to bypass durable production sessions', async () => {
    process.env.VERCEL_ENV = 'production'
    process.env.ADMIN_PASSWORD = 'configured-secret'
    process.env.ADMIN_SESSION_SECRET = 'independent-session-secret'

    authorize.mockResolvedValue({ ok: false, code: 'unauthorized' })
    expect(await isAdmin()).toBe(false)
  })

  it('allows only current provider-backed operator authorization', async () => {
    authorize.mockResolvedValue({ ok: true, actor: { id: 'github:26772694', permissions: ['license:read'] } })
    expect(await isAdmin()).toBe(true)
  })
})
