import { NextResponse } from 'next/server'
import { PRODUCT_MANIFEST } from '../../../../lib/product-manifest'

export const runtime = 'nodejs'

/** Public health check — mirrors the plan's GET /v1/health. */
export async function GET() {
  return NextResponse.json({
    ok: true,
    service: 'vectalon.in',
    version: PRODUCT_MANIFEST.packages.reactNative.version,
    time: Date.now(),
  })
}
