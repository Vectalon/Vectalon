'use client'

import { useState } from 'react'

export function WaitlistForm({ product }: { product: string }) {
  const [email, setEmail] = useState('')
  const [hp, setHp] = useState('')
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'error'>('idle')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) return
    setState('sending')
    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), product, hp }),
      })
      const data = (await res.json()) as { ok?: boolean }
      setState(data.ok ? 'done' : 'error')
    } catch {
      setState('error')
    }
  }

  if (state === 'done') {
    return (
      <div className="chip !border-brand/40 text-brand">
        ✓ You&apos;re on the list — we&apos;ll email you when the {product} harness ships.
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="flex w-full max-w-md flex-col gap-3 sm:flex-row">
      <input
        type="text"
        value={hp}
        onChange={e => setHp(e.target.value)}
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="hidden"
      />
      <input
        type="email"
        required
        value={email}
        onChange={e => setEmail(e.target.value)}
        placeholder="you@company.dev"
        className="input flex-1 font-mono"
      />
      <button type="submit" className="btn-accent" disabled={state === 'sending'}>
        {state === 'sending' ? 'Signing up…' : 'Join the waitlist'}
      </button>
      {state === 'error' && (
        <p className="text-xs text-red-400">Something went wrong — try again or email support@vectalon.in.</p>
      )}
    </form>
  )
}
