'use client'

import { useState } from 'react'
import Link from 'next/link'

type TrialResult =
  | { ok: true; username: string; expiresAt: number }
  | { ok: false; reason: string }

export default function TrialPage() {
  const [username, setUsername] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<TrialResult | null>(null)

  async function start(e: React.FormEvent) {
    e.preventDefault()
    if (!username.trim()) return
    setBusy(true)
    setResult(null)
    try {
      const res = await fetch('/api/v1/trial', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          githubUserId: username.trim().toLowerCase(),
          githubUsername: username.trim(),
        }),
      })
      const data = await res.json()
      if (data.started) {
        setResult({ ok: true, username: username.trim(), expiresAt: data.trial.expiresAt })
      } else {
        setResult({ ok: false, reason: data.reason ?? 'trial could not be started' })
      }
    } catch {
      setResult({ ok: false, reason: 'network error — try again' })
    } finally {
      setBusy(false)
    }
  }

  const expires = result && result.ok ? new Date(result.expiresAt).toLocaleDateString() : null

  return (
    <div className="mx-auto max-w-xl px-4 py-20">
      <div className="mb-8 text-center">
        <h1 className="text-4xl font-bold text-slate-50">Start your 14-day Pro trial</h1>
        <p className="mt-3 text-slate-400">
          No credit card. One GitHub login. Every premium command unlocked — upgrade copilot,
          self-healing CI, bundle budgets.
        </p>
      </div>

      <div className="card">
        {result && result.ok ? (
          <div className="text-center">
            <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-brand/15 text-2xl text-brand">
              ✓
            </div>
            <h2 className="text-lg font-semibold text-slate-50">Trial started, {result.username}!</h2>
            <p className="mt-2 text-sm text-slate-400">
              Pro is unlocked until <span className="font-mono text-brand">{expires}</span>. In
              your project:
            </p>
            <code className="mt-4 block rounded-lg code-bg px-4 py-3 font-mono text-xs text-emerald-600">
              npx vectalon upgrade --diff
            </code>
            <p className="mt-4 text-xs text-slate-500">
              (CLI auth is stubbed in this demo — the API contract is live.)
            </p>
          </div>
        ) : (
          <form onSubmit={start} className="space-y-4">
            <div>
              <label htmlFor="gh" className="mb-1.5 block text-sm font-medium text-slate-300">
                GitHub username
              </label>
              <input
                id="gh"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="octocat"
                className="input"
              />
              <p className="mt-2 text-xs text-slate-500">
                Demo mode: one trial per GitHub account, enforced by the API.
              </p>
            </div>
            {result && !result.ok && (
              <p className="rounded-lg border border-red-600/30 bg-red-600/10 px-4 py-2.5 text-sm text-red-500">
                {result.reason}
              </p>
            )}
            <button type="submit" disabled={busy} className="btn-primary w-full disabled:opacity-50">
              {busy ? 'Starting…' : 'Start 14-day trial'}
            </button>
          </form>
        )}
      </div>

      <div className="mt-6 text-center text-xs text-slate-500">
        Already have a license?{' '}
        <Link href="/pricing" className="text-brand hover:underline">
          See pricing
        </Link>{' '}
        —{' '}
        <Link href="/docs" className="text-brand hover:underline">
          Read the docs
        </Link>
      </div>
    </div>
  )
}
