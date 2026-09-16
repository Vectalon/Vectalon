import { operatorJson, operatorAuthorization, operatorOrigin, operatorTokenHash, operatorHash } from '../../../../lib/operator-host'
import { operatorDatabase } from '../../../../lib/admin-lifecycle/generated/operator/control-plane/database'
import { OPERATOR_ROLES } from '../../../../lib/admin-lifecycle/generated/operator/control-plane/access'
import { changeStoredOperatorMembership } from '../../../../lib/admin-lifecycle/generated/operator/control-plane/membership-postgres'
export const runtime = 'nodejs'
function status(code: string): number { return code === 'unauthorized' ? 401 : code === 'service-unavailable' ? 503 : 403 }
export async function GET() {
  const authorization = await operatorAuthorization('operator:manage')
  if (!authorization.ok) return operatorJson({ ok:false,error:authorization.code },status(authorization.code))
  try {
    const result = await operatorDatabase().query('select subject,github_login,role,active,revision,updated_at from vectalon_private.operator_memberships order by github_login')
    return operatorJson({ ok:true, operators:result.rows })
  } catch { return operatorJson({ ok:false,error:'service-unavailable' },503) }
}
export async function POST(request: Request) {
  try {
    if (request.headers.get('origin') !== operatorOrigin()) return operatorJson({ ok:false,error:'csrf-invalid' },403)
    const text = await request.text()
    if (text.length > 2048) return operatorJson({ ok:false,error:'invalid-request' },400)
    const body = JSON.parse(text) as Record<string,unknown>
    if (!body || typeof body.role !== 'string' || !Object.hasOwn(OPERATOR_ROLES,body.role) || typeof body.active !== 'boolean' || typeof body.reason !== 'string') return operatorJson({ ok:false,error:'invalid-request' },400)
    const authorization = await operatorAuthorization('operator:manage',request,body.reason)
    if (!authorization.ok) return operatorJson({ ok:false,error:authorization.code },status(authorization.code))
    const hash = await operatorTokenHash()
    if (!hash) return operatorJson({ ok:false,error:'unauthorized' },401)
    let subject: string, login: string
    if (body.subject !== undefined) {
      if (typeof body.subject !== 'string' || !/^[1-9][0-9]{0,19}$/.test(body.subject)) return operatorJson({ ok:false,error:'invalid-request' },400)
      const found = await operatorDatabase().query('select subject,github_login from vectalon_private.operator_memberships where subject=$1',[body.subject])
      if (!found.rows[0]) return operatorJson({ ok:false,error:'operator-not-found' },404)
      subject = found.rows[0].subject; login = found.rows[0].github_login
    } else {
      if (typeof body.githubLogin !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/.test(body.githubLogin)) return operatorJson({ ok:false,error:'invalid-request' },400)
      const response = await fetch(`https://api.github.com/users/${encodeURIComponent(body.githubLogin)}`,{ headers:{ accept:'application/vnd.github+json','x-github-api-version':'2022-11-28' },signal:AbortSignal.timeout(10_000),redirect:'error' })
      const value = await response.json() as { id?: unknown; login?: unknown }
      if (!response.ok || !Number.isSafeInteger(value.id) || Number(value.id) < 1 || typeof value.login !== 'string' || value.login.toLowerCase() !== body.githubLogin.toLowerCase()) return operatorJson({ ok:false,error:'github-identity-unavailable' },400)
      subject = String(value.id); login = value.login
    }
    const result = await changeStoredOperatorMembership(operatorDatabase(),{ tokenHash:hash,csrfHash:operatorHash(request.headers.get('x-vectalon-csrf') ?? ''),subject,githubLogin:login,role:body.role,active:body.active,reason:body.reason })
    return result.ok ? operatorJson(result) : operatorJson({ ok:false,error:result.code },status(result.code))
  } catch { return operatorJson({ ok:false,error:'operator-management-unavailable' },503) }
}
