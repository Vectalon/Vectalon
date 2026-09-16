import { POST } from '../app/api/admin/logout/route'
jest.mock('next/headers',()=>({ cookies:async()=>({ get:(name:string)=>name==='vectalon_operator'?{ value:'t'.repeat(43) }:undefined }) }))
jest.mock('../lib/admin-lifecycle/generated/operator/control-plane/database',()=>({ operatorDatabase:()=>({ query:async()=>({ rows:[{ revoked:true }] }) }) }))
describe('operator logout',()=>{
  const previous={ ...process.env }
  beforeEach(()=>{ process.env.VECTALON_OPERATOR_ORIGIN='https://vectalon.in' })
  afterEach(()=>{ process.env={ ...previous } })
  it('revokes durable session and clears both operator cookies',async()=>{
    const response=await POST(new Request('https://vectalon.in/api/admin/logout',{ method:'POST',headers:{ origin:'https://vectalon.in','x-vectalon-csrf':'c'.repeat(43) } }))
    expect(response.status).toBe(200)
    expect(response.cookies.get('vectalon_operator')?.maxAge).toBe(0)
    expect(response.cookies.get('vectalon_operator_csrf')?.maxAge).toBe(0)
  })
  it('rejects cross-origin or missing-CSRF signout',async()=>{
    expect((await POST(new Request('https://vectalon.in/api/admin/logout',{ method:'POST',headers:{ origin:'https://attacker.test' } }))).status).toBe(403)
    expect((await POST(new Request('https://vectalon.in/api/admin/logout',{ method:'POST',headers:{ origin:'https://vectalon.in' } }))).status).toBe(403)
  })
})
