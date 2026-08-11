import { defaultAdminStore, fmtMoney, fmtDate } from '../../../../lib/admin-store'
import { StatusBadge, TierBadge } from '../components/StatusBadge'

export const dynamic = 'force-dynamic'

export default async function AdminCustomersPage() {
  const { customers } = await defaultAdminStore().getData()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-50">Customers</h1>
        <p className="mt-1 text-sm text-slate-500">
          GitHub usernames, tiers, seats, and revenue contribution.
        </p>
      </div>

      <div className="card !p-0 overflow-x-auto">
        <table className="tbl">
          <thead>
            <tr>
              <th>Status</th>
              <th>Name</th>
              <th>Email</th>
              <th>Tier</th>
              <th>Seats</th>
              <th>MRR</th>
              <th>Joined</th>
              <th>Last active</th>
            </tr>
          </thead>
          <tbody>
            {customers.map(c => (
              <tr key={c.id}>
                <td>
                  <StatusBadge status={c.status} />
                </td>
                <td className="font-medium text-slate-50">{c.name ?? c.email}</td>
                <td>{c.email}</td>
                <td>
                  <TierBadge tier={c.tier} />
                </td>
                <td>{c.seats}</td>
                <td className="font-mono text-emerald-300">{fmtMoney(c.mrrCents)}</td>
                <td className="text-slate-500">{fmtDate(c.joinedAt)}</td>
                <td className="text-slate-500">{fmtDate(c.lastActiveAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
