import { POST } from '../app/api/admin/login/route'
import { openOperatorChallenge } from '../lib/admin-lifecycle/generated/operator/control-plane/browser-challenge'
import { consumeOperatorLoginBudget } from '../lib/admin-lifecycle/generated/operator/control-plane/login-budget'
jest.mock('../lib/admin-lifecycle/generated/operator/control-plane/database',()=>({ operatorDatabase:()=>({}) }))
jest.mock('../lib/admin-lifecycle/generated/operator/control-plane/login-budget',()=>({ consumeOperatorLoginBudget:jest.fn() }))
const budget = jest.mocked(consumeOperatorLoginBudget)
describe('GitHub operator login', () => {
  const previous = { ...process.env }
  beforeEach(()=>budget.mockResolvedValue({ allowed:true,retryAfterSeconds:60 }))
  afterEach(() => { process.env = { ...previous }; jest.restoreAllMocks() })
  it('starts a same-origin browser-bound challenge without returning a provider device code', async () => {
    process.env.VERCEL_ENV = 'production'
    process.env.VECTALON_OPERATOR_ORIGIN = 'https://vectalon.in'
    process.env.GITHUB_OAUTH_CLIENT_ID = 'Ov23liLpdUY4dLbPyGJY'
    process.env.ADMIN_SESSION_SECRET = 's'.repeat(48)
    jest.spyOn(global, 'fetch').mockResolvedValue(Response.json({ device_code: 'd'.repeat(40), user_code: 'ABCD-EFGH', verification_uri: 'https://github.com/login/device', expires_in: 900, interval: 5 }))
    const response = await POST(new Request('https://vectalon.in/api/admin/login', { method: 'POST', headers: { origin: 'https://vectalon.in', 'content-type': 'application/json' }, body: '{}' }))
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ userCode: 'ABCD-EFGH', verificationUri: 'https://github.com/login/device' })
    const cookie = response.cookies.get('vectalon_operator_challenge')?.value
    expect(cookie).toBeDefined()
    expect(openOperatorChallenge(cookie!, 's'.repeat(48), 'https://vectalon.in', Date.now())?.deviceCode).toBe('d'.repeat(40))
    expect(response.headers.get('cache-control')).toBe('no-store')
  })
  it('rejects cross-origin starts before contacting GitHub', async () => {
    process.env.VECTALON_OPERATOR_ORIGIN = 'https://vectalon.in'
    const fetcher = jest.spyOn(global, 'fetch')
    const response = await POST(new Request('https://vectalon.in/api/admin/login', { method: 'POST', headers: { origin: 'https://attacker.test', 'content-type': 'application/json' }, body: '{}' }))
    expect(response.status).toBe(403)
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('rejects exhausted durable login budget before contacting GitHub',async()=>{
    process.env.VECTALON_OPERATOR_ORIGIN='https://vectalon.in';process.env.ADMIN_SESSION_SECRET='s'.repeat(48);process.env.GITHUB_OAUTH_CLIENT_ID='Ov23liLpdUY4dLbPyGJY'
    budget.mockResolvedValue({ allowed:false,retryAfterSeconds:60 })
    const fetcher=jest.spyOn(global,'fetch').mockResolvedValue(Response.json({ device_code:'d'.repeat(40),user_code:'ABCD-EFGH',verification_uri:'https://github.com/login/device',expires_in:900,interval:5 }))
    const response=await POST(new Request('https://vectalon.in/api/admin/login',{ method:'POST',headers:{ origin:'https://vectalon.in' } }))
    expect(response.status).toBe(429);expect(fetcher).not.toHaveBeenCalled()
  })
})
