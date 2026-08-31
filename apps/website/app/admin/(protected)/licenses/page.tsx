import { defaultAdminStore, fmtDate } from '../../../../lib/admin-store'
import { StatusBadge, TierBadge } from '../components/StatusBadge'
import { IssueLicenseForm } from '../components/IssueLicenseForm'
import { RevokeButton } from '../components/RevokeButton'

export const dynamic = 'force-dynamic'

export default async function AdminLicensesPage() {
  const { licenses } = await defaultAdminStore().getData()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-50">Licenses</h1>
        <p className="mt-1 text-sm text-slate-500">
          Generate, view, and revoke license keys. Online clients receive revocation on their
          next validation; offline clients follow the license grace policy.
        </p>
      </div>

      <IssueLicenseForm />

      <div className="card !p-0 overflow-x-auto">
        <table className="tbl">
          <thead>
            <tr>
              <th>Status</th>
              <th>Key</th>
              <th>Tier</th>
              <th>Email</th>
              <th>Seats</th>
              <th>Issued</th>
              <th>Expires</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {licenses.map(l => (
              <tr key={l.key}>
                <td>
                  <StatusBadge status={l.status} />
                </td>
                <td className="font-mono text-xs text-emerald-300">
                  {l.key.slice(0, 14)}…
                </td>
                <td>
                  <TierBadge tier={l.tier} />
                </td>
                <td>{l.email}</td>
                <td>{l.seats}</td>
                <td className="text-slate-500">{fmtDate(l.issuedAt)}</td>
                <td className="text-slate-500">{fmtDate(l.expiresAt)}</td>
                <td className="text-right">
                  {l.status === 'active' && <RevokeButton licenseKey={l.key} email={l.email} />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
