import { NextResponse } from 'next/server'
import { pollDeviceAuthorization } from '../../../../../../lib/trial-device'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  try {
    if (Number(request.headers.get('content-length') ?? 0) > 2_000) return NextResponse.json({ status: 'invalid_request' }, { status: 413 })
    const body: unknown = await request.json()
    const deviceCode = body && typeof body === 'object' ? (body as { deviceCode?: unknown }).deviceCode : undefined
    if (typeof deviceCode !== 'string') return NextResponse.json({ status: 'invalid_request' }, { status: 400 })
    const result = await pollDeviceAuthorization(deviceCode, config())
    const { httpStatus, ...payload } = result
    return NextResponse.json(payload, { status: httpStatus })
  } catch {
    return NextResponse.json({ status: 'unavailable' }, { status: 503 })
  }
}

function config() {
  return {
    clientId: process.env.GITHUB_OAUTH_CLIENT_ID ?? '',
    controlPlaneUrl: process.env.ADMIN_CONTROL_PLANE_URL ?? '',
    controlPlaneSecret: process.env.VECTALON_CONTROL_PLANE_SECRET ?? '',
  }
}
