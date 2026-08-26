import { defaultAdminStore, fmtMoney } from '../../../../lib/admin-store'

export const dynamic = 'force-dynamic'

export default async function AdminUsagePage() {
  const { featureUsage, revenueByMonth } = await defaultAdminStore().getData()
  const maxCount = Math.max(...featureUsage.map(f => f.count), 1)
  const maxRevenue = Math.max(...revenueByMonth.map(m => m.mrrCents), 1)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-50">Feature usage</h1>
        <p className="mt-1 text-sm text-slate-500">
          Which capabilities the fleet actually uses — drives roadmap and gate tuning.
        </p>
      </div>

      <div className="card">
        <h2 className="mb-5 font-semibold text-slate-50">Command volume</h2>
        <div className="space-y-4">
          {featureUsage.map(f => (
            <div key={f.feature} className="flex items-center gap-4">
              <span className="w-28 font-mono text-sm text-slate-50">{f.feature}</span>
              <div className="h-3 flex-1 overflow-hidden rounded-full code-bg">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-brand/80 to-brand"
                  style={{ width: `${(f.count / maxCount) * 100}%` }}
                />
              </div>
              <span className="w-16 text-right font-mono text-sm text-slate-400">
                {f.count.toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <h2 className="mb-5 font-semibold text-slate-50">Revenue by month</h2>
        <div className="flex h-48 items-end gap-4">
          {revenueByMonth.map(m => (
            <div key={m.month} className="group flex flex-1 flex-col items-center gap-1.5">
              <div className="text-[10px] text-slate-500 opacity-0 transition group-hover:opacity-100">
                {fmtMoney(m.mrrCents)}
              </div>
              <div
                className="w-full rounded-t bg-gradient-to-t from-brand/70 to-emerald-300 transition group-hover:from-brand"
                style={{ height: `${Math.max(4, (m.mrrCents / maxRevenue) * 160)}px` }}
              />
              <div className="text-[10px] text-slate-600">{m.month}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
