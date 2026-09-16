import { POST } from '../app/api/admin/operators/route'
import { operatorAuthorization } from '../lib/operator-host'
import { changeStoredOperatorMembership } from '../lib/admin-lifecycle/generated/operator/control-plane/membership-postgres'
jest.mock('../lib/operator-host', () => ({ ...jest.requireActual('../lib/operator-host'), operatorAuthorization: jest.fn(), operatorTokenHash: async () => '1'.repeat(64) }))
jest.mock('../lib/admin-lifecycle/generated/operator/control-plane/database', () => ({ operatorDatabase: () => ({ query: async () => ({ rows: [{ subject: '36885121', github_login: 'MoumitaM' }] }) }) }))
jest.mock('../lib/admin-lifecycle/generated/operator/control-plane/membership-postgres', () => ({ changeStoredOperatorMembership: jest.fn() }))
const authorize = jest.mocked(operatorAuthorization), change = jest.mocked(changeStoredOperatorMembership)
describe('admin management endpoint', () => {
  const previous = { ...process.env }
  beforeEach(() => { process.env.VECTALON_OPERATOR_ORIGIN = 'https://vectalon.in' })
  afterEach(() => { process.env = { ...previous }; jest.restoreAllMocks(); authorize.mockReset(); change.mockReset() })
  function request(body: object) { return new Request('https://vectalon.in/api/admin/operators', { method: 'POST', headers: { origin: 'https://vectalon.in', 'x-vectalon-csrf': 'browser-csrf', 'content-type': 'application/json' }, body: JSON.stringify({ role: 'support', active: true, reason: 'Approved support access', ...body }) }) }
  it('resolves new recipients through GitHub numeric identity rather than supplied IDs', async () => {
    authorize.mockResolvedValue({ ok: true, actor: { id: 'github:26772694', permissions: [] } })
    change.mockResolvedValue({ ok: true })
    jest.spyOn(global, 'fetch').mockResolvedValue(Response.json({ id: 123456, login: 'NewOperator' }))
    const response = await POST(request({ githubLogin: 'NewOperator' }))
    expect(response.status).toBe(200)
    expect(change).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ subject: '123456', githubLogin: 'NewOperator', tokenHash: '1'.repeat(64), csrfHash: expect.stringMatching(/^[a-f0-9]{64}$/) }))
  })
  it('revokes existing recipients by stored identity even if supplied username is forged', async () => {
    authorize.mockResolvedValue({ ok: true, actor: { id: 'github:26772694', permissions: [] } })
    change.mockResolvedValue({ ok: false, code: 'last-platform-admin' })
    const fetcher = jest.spyOn(global, 'fetch')
    expect((await POST(request({ subject: '36885121', githubLogin: 'attacker', active: false }))).status).toBe(403)
    expect(change).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ subject: '36885121', githubLogin: 'MoumitaM', active: false }))
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('denies non-platform operators before recipient lookup or mutation', async () => {
    authorize.mockResolvedValue({ ok: false, code: 'forbidden' })
    const fetcher = jest.spyOn(global, 'fetch')
    expect((await POST(request({ githubLogin: 'NewOperator' }))).status).toBe(403)
    expect(fetcher).not.toHaveBeenCalled(); expect(change).not.toHaveBeenCalled()
  })
})
