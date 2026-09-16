import { randomUUID } from 'node:crypto'
import { operatorJson, operatorOrigin, operatorTokenHash } from '../../../../lib/operator-host'
import { operatorDatabase } from '../../../../lib/admin-lifecycle/generated/operator/control-plane/database'
import { issueStoredPlatformSdkLease } from '../../../../lib/admin-lifecycle/generated/operator/control-plane/sdk-postgres'
import { signerFromEnvironment } from '../../../../lib/admin-lifecycle/generated/operator/licenses/signer'
export const runtime = 'nodejs'
export async function POST(request: Request) {
  try {
    const origin = operatorOrigin()
    if (request.headers.get('origin') !== origin) return operatorJson({ ok: false, error: 'csrf-invalid' },403)
    const hash = await operatorTokenHash()
    if (!hash) return operatorJson({ ok: false, error: 'unauthorized' },401)
    const text = await request.text()
    if (text.length > 2048) return operatorJson({ ok: false, error: 'invalid-request' },400)
    const body = JSON.parse(text) as { reason?: unknown }
    const result = await issueStoredPlatformSdkLease(operatorDatabase(), hash, { now: Date.now(), origin, expectedOrigin: origin, csrf: request.headers.get('x-vectalon-csrf') ?? undefined, reason: typeof body?.reason === 'string' ? body.reason : undefined, issuer: origin, leaseId: `operator-${randomUUID()}` }, signerFromEnvironment())
    return result.ok ? operatorJson(result) : operatorJson({ ok: false, error: result.code }, result.code === 'unauthorized' ? 401 : result.code === 'service-unavailable' || result.code === 'signing-unavailable' ? 503 : 403)
  } catch { return operatorJson({ ok: false, error: 'sdk-access-unavailable' },503) }
}
