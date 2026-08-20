import { defaultAdminStore, fmtMoney } from '../../../lib/admin-store'

export const dynamic = 'force-dynamic'

export default async function AdminOverviewPage() {
  const store = defaultAdminStore()
  const [data, stats] = await Promise.all([store.getData(), store.stats()])
  const maxRevenue = Math.max(...data.revenueByMonth.map(m => m.mrrCents), 1)

  const cards = [
    { label: 'MRR', value: fmtMoney(stats.mrrCents), sub: `${stats.activeCustomers} paying customers` },
    { label: 'ARR', value: fmtMoney(stats.arrCents), sub: 'annualized' },
    { label: 'Active licenses', value: String(stats.activeLicenses), sub: `${stats.revokedLicenses} revoked` },
    { label: 'Trials', value: String(stats.trialCount), sub: `${stats.trialConversionRate}% converted` },
  ]

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-50">Overview</h1>
        <p className="mt-1 text-sm text-slate-500">
          Revenue, trials, and license health — live from the online registry.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map(c => (
          <div key={c.label} className="stat">
            <div className="stat-label">{c.label}</div>
            <div className="stat-value">{c.value}</div>
            <div className="mt-1 text-xs text-slate-500">{c.sub}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card">
          <h2 className="mb-5 font-semibold text-slate-50">Monthly recurring revenue</h2>
          <div className="flex h-44 items-end gap-3">
            {data.revenueByMonth.map(m => (
              <div key={m.month} className="group flex flex-1 flex-col items-center gap-1.5">
                <div className="text-[10px] text-slate-500 opacity-0 transition group-hover:opacity-100">
                  {fmtMoney(m.mrrCents)}
                </div>
                <div
                  className="w-full rounded-t bg-gradient-to-t from-brand/70 to-brand transition hover:from-brand hover:to-emerald-300"
                  style={{ height: `${Math.max(4, (m.mrrCents / maxRevenue) * 140)}px` }}
                />
                <div className="text-[10px] text-slate-600">{m.month.slice(5)}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <h2 className="mb-5 font-semibold text-slate-50">Top features</h2>
          <div className="space-y-3">
            {stats.topFeatures.map((f, i) => (
              <div key={f.feature} className="flex items-center gap-3">
                <span className="w-20 font-mono text-xs text-slate-400">{f.feature}</span>
                <div className="h-2.5 flex-1 overflow-hidden rounded-full code-bg">
                  <div
                    className="h-full rounded-full bg-brand"
                    style={{ width: `${(f.count / stats.topFeatures[0].count) * 100}%` }}
                  />
                </div>
                <span className="w-12 text-right font-mono text-xs text-slate-400">
                  {f.count.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card flex flex-wrap items-center justify-between gap-3 text-sm">
        <span className="text-slate-400">
          API: <code className="rounded code-bg px-1.5 py-0.5 font-mono text-xs text-emerald-600">POST /v1/validate</code>{' '}
          — <code className="rounded code-bg px-1.5 py-0.5 font-mono text-xs text-emerald-600">POST /v1/trial</code>{' '}
          — <code className="rounded code-bg px-1.5 py-0.5 font-mono text-xs text-emerald-600">GET /v1/health</code>
        </span>
        <span className="text-xs text-slate-500">registry: {data.licenses.length} licenses — {data.trials.length} trials</span>
      </div>
    </div>
  )
}
