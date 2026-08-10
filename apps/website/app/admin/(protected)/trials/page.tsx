import { defaultAdminStore, fmtDate } from '../../../../lib/admin-store'
import { StatusBadge, TierBadge } from '../components/StatusBadge'

export const dynamic = 'force-dynamic'

export default async function AdminTrialsPage() {
  const { trials } = await defaultAdminStore().getData()
  const converted = trials.filter(t => t.converted).length

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Trials</h1>
        <p className="mt-1 text-sm text-slate-500">
          GitHub-based 14-day trials — {trials.length} total, {converted} converted (
          {trials.length ? Math.round((converted / trials.length) * 100) : 0}%).
        </p>
      </div>

      <div className="card !p-0 overflow-x-auto">
        <table className="tbl">
          <thead>
            <tr>
              <th>GitHub</th>
              <th>Tier</th>
              <th>Started</th>
              <th>Expires</th>
              <th>Converted</th>
            </tr>
          </thead>
          <tbody>
            {trials.map((t, i) => (
              <tr key={`${t.githubUserId}-${i}`}>
                <td className="font-mono text-white">@{t.githubUsername}</td>
                <td>
                  <TierBadge tier={t.tier} />
                </td>
                <td className="text-slate-500">{fmtDate(t.startedAt)}</td>
                <td className="text-slate-500">{fmtDate(t.expiresAt)}</td>
                <td>
                  <StatusBadge status={t.converted ? 'active' : 'pending'} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
