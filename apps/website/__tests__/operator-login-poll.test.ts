import { NextRequest } from 'next/server'
import { POST } from '../app/api/admin/login/poll/route'
import { sealOperatorChallenge } from '../lib/admin-lifecycle/generated/operator/control-plane/browser-challenge'
import { createStoredOperatorSession } from '../lib/admin-lifecycle/generated/operator/control-plane/session-postgres'
jest.mock('../lib/admin-lifecycle/generated/operator/control-plane/session-postgres', () => ({ createStoredOperatorSession: jest.fn(), authorizeStoredOperator: jest.fn() }))
jest.mock('../lib/admin-lifecycle/generated/operator/control-plane/database', () => ({ operatorDatabase: jest.fn(() => ({})) }))
jest.mock('../lib/admin-lifecycle/generated/operator/control-plane/login-budget',()=>({ consumeOperatorLoginBudget:async()=>({ allowed:true,retryAfterSeconds:60 }) }))
const createSession = jest.mocked(createStoredOperatorSession)
describe('operator login completion', () => {
  const previous = { ...process.env }
  beforeEach(() => { process.env.VECTALON_OPERATOR_ORIGIN = 'https://vectalon.in'; process.env.ADMIN_SESSION_SECRET = 's'.repeat(48); process.env.GITHUB_OAUTH_CLIENT_ID = 'Ov23liLpdUY4dLbPyGJY' })
  afterEach(() => { process.env = { ...previous }; jest.restoreAllMocks(); createSession.mockReset() })
  function request(expiresAt = Date.now()+60_000, origin = 'https://vectalon.in') {
    const cookie = sealOperatorChallenge({ deviceCode: 'd'.repeat(40), nonce: 'n'.repeat(43), origin: 'https://vectalon.in', createdAt: expiresAt-900_000, expiresAt, interval: 5 }, 's'.repeat(48))
    return new NextRequest('https://vectalon.in/api/admin/login/poll', { method: 'POST', headers: { origin, cookie: `vectalon_operator_challenge=${cookie}` } })
  }
  it('returns only a server-committed session in a secure HttpOnly cookie', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValueOnce(Response.json({ access_token: 'provider-secret', token_type: 'bearer' })).mockResolvedValueOnce(Response.json({ id: 26772694, login: 'bhishaksanyal' }))
    createSession.mockResolvedValue({ ok: true, token: 't'.repeat(43), csrf: 'c'.repeat(43), expiresAt: Date.now()+28_800_000 })
    const response = await POST(request())
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true, status: 'complete' })
    expect(response.cookies.get('vectalon_operator')).toMatchObject({ value: 't'.repeat(43), httpOnly: true, secure: true, sameSite: 'strict' })
    expect(createSession).toHaveBeenCalledWith(expect.anything(), { provider: 'github', providerSubjectId: '26772694', displayName: 'bhishaksanyal' }, expect.objectContaining({ challengeBound: true, challengeHash: expect.stringMatching(/^[a-f0-9]{64}$/) }))
  })
  it('rejects expired and cross-origin challenges before contacting GitHub', async () => {
    const fetcher = jest.spyOn(global, 'fetch')
    expect((await POST(request(Date.now()-1))).status).toBe(410)
    expect((await POST(request(undefined, 'https://attacker.test'))).status).toBe(403)
    expect(fetcher).not.toHaveBeenCalled()
    expect(createSession).not.toHaveBeenCalled()
  })
  it('never installs a session when audit or membership verification failed', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValueOnce(Response.json({ access_token: 'provider-secret', token_type: 'bearer' })).mockResolvedValueOnce(Response.json({ id: 26772694, login: 'bhishaksanyal' }))
    createSession.mockResolvedValue({ ok: false, code: 'service-unavailable' })
    const response = await POST(request())
    expect(response.status).toBe(503)
    expect(response.cookies.get('vectalon_operator')).toBeUndefined()
  })
})
