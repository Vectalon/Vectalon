import { fetchTelemetryErrors } from '../../../../lib/telemetry'
import { ErrorStream } from '../components/ErrorStream'

export const dynamic = 'force-dynamic'

/** Error dashboard — reads the telemetry backend's admin endpoint. */
export default async function AdminErrorsPage() {
  const data = await fetchTelemetryErrors()

  if (!data) {
    return (
      <div className="card">
        <h2 className="font-semibold text-slate-50">Client errors</h2>
        <p className="mt-2 text-sm text-slate-400">
          Telemetry not reachable. Set <span className="font-mono text-brand">TELEMETRY_URL</span> and{' '}
          <span className="font-mono text-brand">TELEMETRY_ADMIN_TOKEN</span> on the website so the
          dashboard can read the telemetry backend&apos;s <span className="font-mono">/v1/admin/errors</span>.
        </p>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-slate-50">Client errors</h2>
        <p className="mt-1 text-sm text-slate-400">
          RN 0.22.3+ sends coarse, anonymous automatic errors. Older records may retain
          client identifiers and stacks. Dismissed rows are remembered in this browser.
        </p>
      </div>
      <ErrorStream errors={data.errors} />
    </div>
  )
}
