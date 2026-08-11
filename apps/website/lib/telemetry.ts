/**
 * Website-side reader for the telemetry backend's admin-only error endpoint.
 * The telemetry app owns error storage (Vercel KV); the admin portal is a
 * viewer authenticated with TELEMETRY_ADMIN_TOKEN.
 */

export interface TelemetryError {
  message: string
  stack?: string
  context?: string
  command?: string
  version?: string
  os?: string
  timestamp?: number
  clientId?: string
  project?: string
  production?: boolean
}

export async function fetchTelemetryErrors(): Promise<{ errors: TelemetryError[] } | null> {
  const token = process.env.TELEMETRY_ADMIN_TOKEN
  if (!token) return null
  const base = process.env.TELEMETRY_URL || 'https://telemetry.vectalon.dev'
  try {
    const res = await fetch(`${base}/v1/admin/errors`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8_000),
      cache: 'no-store',
    })
    if (!res.ok) return null
    const data = (await res.json()) as { errors?: TelemetryError[] }
    return { errors: Array.isArray(data.errors) ? data.errors : [] }
  } catch {
    return null
  }
}
