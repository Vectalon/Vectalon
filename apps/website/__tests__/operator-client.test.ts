import { operatorMutationHeaders } from '../lib/operator-client'
it('binds mutations to the exact browser CSRF cookie and explicit reason',()=>{
  expect(operatorMutationHeaders('Approved access',`unrelated=value; vectalon_operator_csrf=${'c'.repeat(43)}; another=value`)).toEqual({ 'content-type':'application/json','x-vectalon-csrf':'c'.repeat(43),'x-vectalon-reason':'Approved access' })
  expect(operatorMutationHeaders('Approved access',`fake_vectalon_operator_csrf=${'c'.repeat(43)}`)['x-vectalon-csrf']).toBeUndefined()
})
