'use client'

import { useRouter } from 'next/navigation'
import { operatorMutationHeaders } from '../../../lib/operator-client'

export function LogoutButton() {
  const router = useRouter()
  return (
    <button
      onClick={async () => {
        const response=await fetch('/api/admin/logout', { method: 'POST',headers:operatorMutationHeaders() })
        if (!response.ok) { alert('Sign-out failed. Please retry; your session was not confirmed revoked.');return }
        router.push('/')
        router.refresh()
      }}
      className="w-full rounded-lg border border-ink-700 px-3 py-2 text-left text-sm text-slate-400 transition hover:border-red-500/40 hover:text-red-300"
    >
      ← Log out
    </button>
  )
}
