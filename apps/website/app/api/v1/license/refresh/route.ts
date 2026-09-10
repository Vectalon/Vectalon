import { configuredLifecycleAdapter } from '../../../../../lib/lifecycle-gateway'
import { handleLicenseRefresh } from '../../../../../lib/license-refresh-route'

export const runtime = 'nodejs'

/** Authenticated customer activation/refresh proxy; the durable registry stays authoritative. */
export async function POST(request: Request) {
  return handleLicenseRefresh(request, configuredLifecycleAdapter())
}
