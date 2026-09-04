import { NextResponse } from 'next/server'
import { startDeviceAuthorization } from '../../../../../../lib/trial-device'

export const runtime = 'nodejs'

export async function POST() {
  try {
    return NextResponse.json(await startDeviceAuthorization(config()))
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
