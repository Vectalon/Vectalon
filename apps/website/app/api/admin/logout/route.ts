import { ADMIN_COOKIE } from '../../../../lib/admin-auth'
import { operatorJson,operatorOrigin,operatorHash,operatorTokenHash,OPERATOR_COOKIE,OPERATOR_CSRF_COOKIE,OPERATOR_CHALLENGE_COOKIE } from '../../../../lib/operator-host'
import { operatorDatabase } from '../../../../lib/admin-lifecycle/generated/operator/control-plane/database'

export const runtime = 'nodejs'

export async function POST(request:Request) {
  try {
    const csrf=request.headers.get('x-vectalon-csrf') ?? ''
    if (request.headers.get('origin')!==operatorOrigin() || !/^[A-Za-z0-9_-]{43}$/.test(csrf)) return operatorJson({ ok:false,error:'csrf-invalid' },403)
    const hash=await operatorTokenHash()
    if (!hash) return operatorJson({ ok:false,error:'unauthorized' },401)
    const result=await operatorDatabase().query('select vectalon_private.operator_revoke_session($1,$2) as revoked',[hash,operatorHash(csrf)])
    if (result.rows[0]?.revoked!==true) return operatorJson({ ok:false,error:'unauthorized' },401)
    const response=operatorJson({ ok:true })
    for (const name of [ADMIN_COOKIE,OPERATOR_COOKIE,OPERATOR_CSRF_COOKIE]) response.cookies.set(name,'',{ httpOnly:name!==OPERATOR_CSRF_COOKIE,secure:true,sameSite:'strict',path:'/',maxAge:0 })
    response.cookies.set(OPERATOR_CHALLENGE_COOKIE,'',{ httpOnly:true,secure:true,sameSite:'strict',path:'/api/admin',maxAge:0 })
    return response
  } catch { return operatorJson({ ok:false,error:'logout-unavailable' },503) }
}
