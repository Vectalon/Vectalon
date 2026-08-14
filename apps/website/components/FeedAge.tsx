'use client'

import { useEffect, useState } from 'react'

/**
 * "Last refreshed" label for the intel feed, e.g. "12m ago".
 *
 * The feed is fetched server-side with an hourly revalidation, so the
 * timestamp is baked into the page at render/revalidate time. This component
 * re-computes the relative label every 30s so the age stays accurate in the
 * browser between revalidations. It renders nothing until after mount so the
 * server-rendered HTML and the hydrated tree never disagree.
 */

export function formatAge(fetchedAt: number, now: number): string {
  const secs = Math.max(0, Math.floor((now - fetchedAt) / 1000))
  if (secs < 60) return 'just now'
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export function FeedAge({ fetchedAt }: { fetchedAt: number }) {
  const [label, setLabel] = useState<string | null>(null)

  useEffect(() => {
    const tick = () => setLabel(formatAge(fetchedAt, Date.now()))
    tick()
    const t = setInterval(tick, 30_000)
    return () => clearInterval(t)
  }, [fetchedAt])

  if (label === null) return null
  return <span aria-label={`intel refreshed ${label}`}>{label}</span>
}
