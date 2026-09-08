import { NextResponse } from 'next/server'
import { type CustomerLifecycleAction, type DurableLifecycleAdapter } from './lifecycle-gateway'

/** Request adapter kept outside the Next route module so the public route exports only handlers. */
export async function handleLicenseRefresh(request: Request, adapter: DurableLifecycleAdapter): Promise<NextResponse> {
  const credential = bearerCredential(request.headers.get('authorization'))
  if (!credential) return NextResponse.json({ contractVersion: '1.0.0', ok: false, error: { code: 'unauthorized', retryable: false } }, { status: 401 })
  const action = await requestedAction(request)
  if (!action) return NextResponse.json({ contractVersion: '1.0.0', ok: false, error: { code: 'invalid_command', retryable: false } }, { status: 400 })
  const result = await adapter.execute({ action, credential })
  if (result.ok) return NextResponse.json({ contractVersion: '1.0.0', ok: true, credential: result.credential })
  const status = result.code === 'unauthorized' ? 401 : result.code === 'not_found' ? 404 : result.code === 'invalid_transition' ? 409 : result.code === 'contract_invalid' ? 502 : 503
  return NextResponse.json({ contractVersion: '1.0.0', ok: false, error: { code: result.code, retryable: result.retryable } }, { status })
}

function bearerCredential(header: string | null): string | null {
  const match = /^Bearer ([^\s]{1,16384})$/.exec(header ?? '')
  return match?.[1] ?? null
}

async function requestedAction(request: Request): Promise<CustomerLifecycleAction | null> {
  if (!request.body) return 'refresh'
  let body: unknown
  try { body = await request.json() } catch { return null }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null
  const values = body as Record<string, unknown>
  if ('credential' in values || 'token' in values || 'license' in values) return null
  return values.action === 'activate' || values.action === 'refresh' ? values.action : null
}
