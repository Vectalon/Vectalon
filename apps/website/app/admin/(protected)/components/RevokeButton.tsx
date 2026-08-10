'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function RevokeButton({ licenseKey, email }: { licenseKey: string; email: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function revoke() {
    if (!confirm(`Revoke the license for ${email}? This is instant and cannot be undone.`)) return
    setBusy(true)
    setErr(null)
    try {
      const res = await fetch(`/api/admin/licenses/${encodeURIComponent(licenseKey)}/revoke`, {
        method: 'POST',
      })
      if (!res.ok) {
        setErr('failed to revoke')
      } else {
        router.refresh()
      }
    } catch {
      setErr('network error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        onClick={revoke}
        disabled={busy}
        className="rounded border border-red-500/30 px-2.5 py-1 text-xs font-medium text-red-300 transition hover:bg-red-500/10 disabled:opacity-50"
      >
        {busy ? '…' : 'Revoke'}
      </button>
      {err && <span className="text-xs text-red-300">{err}</span>}
    </span>
  )
}
