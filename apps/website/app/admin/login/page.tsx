'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function AdminLoginPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error ?? 'invalid password')
        setBusy(false)
        return
      }
      router.push('/admin')
      router.refresh()
    } catch {
      setError('network error')
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-sm px-4 py-24">
      <div className="card">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-xl bg-brand text-xl text-on-brand">▣</div>
          <h1 className="text-xl font-bold text-slate-50">Admin dashboard</h1>
          <p className="mt-1 text-sm text-slate-500">vectalon.in — license operations</p>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label htmlFor="pw" className="mb-1.5 block text-sm font-medium text-slate-300">
              Password
            </label>
            <input
              id="pw"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              autoFocus
              className="input"
            />
            <p className="mt-2 text-xs text-slate-500">
              Demo mode: the password is <span className="font-mono text-brand">vectalon</span>.
              Set <span className="font-mono">ADMIN_PASSWORD</span> to override.
            </p>
          </div>
          {error && (
            <p className="rounded-lg border border-red-600/30 bg-red-600/10 px-4 py-2.5 text-sm text-red-500">
              {error}
            </p>
          )}
          <button type="submit" disabled={busy} className="btn-primary w-full disabled:opacity-50">
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}
