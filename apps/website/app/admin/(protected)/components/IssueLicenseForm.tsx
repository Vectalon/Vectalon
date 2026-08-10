'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function IssueLicenseForm() {
  const router = useRouter()
  const [tier, setTier] = useState('pro')
  const [email, setEmail] = useState('')
  const [seats, setSeats] = useState(1)
  const [days, setDays] = useState(365)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setMsg(null)
    setErr(null)
    try {
      const res = await fetch('/api/admin/licenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier, email, seats, days }),
      })
      const data = await res.json()
      if (!res.ok) {
        setErr(data.error ?? 'failed to issue license')
      } else {
        setMsg(`Issued ${data.license.tier} license — ${data.license.key.slice(0, 14)}…`)
        setEmail('')
        router.refresh()
      }
    } catch {
      setErr('network error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="card flex flex-col gap-3 sm:flex-row sm:items-end">
      <div className="flex-1">
        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500">Tier</label>
        <select value={tier} onChange={e => setTier(e.target.value)} className="input">
          <option value="free">free</option>
          <option value="pro">pro</option>
          <option value="team">team</option>
          <option value="enterprise">enterprise</option>
        </select>
      </div>
      <div className="flex-[2]">
        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500">Email</label>
        <input
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="customer@company.com"
          required
          className="input"
        />
      </div>
      <div>
        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500">Seats</label>
        <input
          type="number"
          min={1}
          value={seats}
          onChange={e => setSeats(Number(e.target.value))}
          className="input w-20"
        />
      </div>
      <div>
        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500">Days</label>
        <input
          type="number"
          min={1}
          value={days}
          onChange={e => setDays(Number(e.target.value))}
          className="input w-24"
        />
      </div>
      <button type="submit" disabled={busy} className="btn-primary shrink-0 disabled:opacity-50">
        {busy ? 'Issuing…' : 'Issue license'}
      </button>
      {msg && <p className="text-xs text-emerald-300">{msg}</p>}
      {err && <p className="text-xs text-red-300">{err}</p>}
    </form>
  )
}
