'use client'

import { useMemo, useState } from 'react'
import type { TelemetryError } from '../../../../lib/telemetry'

const DISMISS_KEY = 'vectalon-admin-dismissed-errors'

function loadDismissed(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(DISMISS_KEY) || '[]') as unknown
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

function errorId(e: TelemetryError): string {
  return `${e.clientId ?? 'none'}:${e.message}:${e.timestamp ?? 0}`
}

function fmtTime(ts?: number): string {
  if (!ts) return '—'
  return new Date(ts).toISOString().replace('T', ' ').slice(0, 19)
}

interface ClientGroup {
  clientId: string
  project?: string
  count: number
  lastSeen: number
  errors: TelemetryError[]
}

function groupByClient(errors: TelemetryError[]): ClientGroup[] {
  const map = new Map<string, ClientGroup>()
  for (const e of errors) {
    const id = e.clientId || '(no client id)'
    const g = map.get(id) ?? { clientId: id, project: e.project, count: 0, lastSeen: 0, errors: [] }
    g.count++
    g.lastSeen = Math.max(g.lastSeen, e.timestamp ?? 0)
    g.errors.push(e)
    map.set(id, g)
  }
  return [...map.values()].sort((a, b) => b.lastSeen - a.lastSeen)
}

export function ErrorStream({ errors }: { errors: TelemetryError[] }) {
  const [dismissed, setDismissed] = useState<string[]>(() => loadDismissed())
  const [selected, setSelected] = useState<string | null>(null)

  const groups = useMemo(() => groupByClient(errors), [errors])
  const visible = dismissed.length
    ? groups.map(g => ({
        ...g,
        errors: g.errors.filter(e => !dismissed.includes(errorId(e))),
        count: g.errors.filter(e => !dismissed.includes(errorId(e))).length,
      })).filter(g => g.count > 0)
    : groups

  const selectedGroup = selected ? visible.find(g => g.clientId === selected) : null

  function dismiss(ids: string[]) {
    setDismissed(prev => {
      const next = [...new Set([...prev, ...ids])].slice(-2000)
      localStorage.setItem(DISMISS_KEY, JSON.stringify(next))
      return next
    })
  }

  function resetDismissed() {
    localStorage.removeItem(DISMISS_KEY)
    setDismissed([])
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
      {/* Client list */}
      <div className="card !p-2">
        <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
          clients ({visible.length})
        </div>
        {visible.length === 0 && (
          <div className="px-3 py-6 text-center text-sm text-slate-500">
            No errors — or everything dismissed.
          </div>
        )}
        <ul className="space-y-0.5">
          {visible.map(g => (
            <li key={g.clientId}>
              <button
                type="button"
                onClick={() => setSelected(g.clientId)}
                className={`w-full rounded-md px-3 py-2 text-left transition ${
                  selected === g.clientId ? 'bg-ink-700/70' : 'hover:bg-ink-700/40'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-mono text-xs text-white">{g.clientId}</span>
                  <span className="badge badge-danger !px-1.5 !py-0 text-[10px]">{g.count}</span>
                </div>
                <div className="mt-0.5 text-[11px] text-slate-500">
                  {g.project || 'no project'} · {fmtTime(g.lastSeen).slice(5, 16)}
                </div>
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={resetDismissed}
          className="mt-2 w-full rounded-md px-3 py-1.5 text-xs text-slate-500 transition hover:text-brand"
        >
          Reset dismissed
        </button>
      </div>

      {/* Error stream for the selected client */}
      <div className="card !p-0 overflow-hidden">
        {!selectedGroup && (
          <div className="px-5 py-12 text-center text-sm text-slate-500">
            Select a client to inspect its error stream.
          </div>
        )}
        {selectedGroup && (
          <>
            <div className="flex items-center justify-between border-b border-ink-700 px-5 py-3">
              <div className="font-mono text-sm text-white">{selectedGroup.clientId}</div>
              <button
                type="button"
                onClick={() => dismiss(selectedGroup.errors.map(errorId))}
                className="btn-ghost !px-3 !py-1.5 text-xs"
              >
                Dismiss {selectedGroup.errors.length}
              </button>
            </div>
            <ul className="max-h-[62vh] divide-y divide-ink-700/50 overflow-y-auto">
              {selectedGroup.errors.map(e => {
                const id = errorId(e)
                const hidden = dismissed.includes(id)
                return (
                  <li key={id} className={`px-5 py-3 ${hidden ? 'opacity-40' : ''}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-mono text-[13px] leading-snug text-red-300">{e.message}</div>
                        {e.context && (
                          <div className="mt-1 text-xs text-slate-500">context: {e.context}</div>
                        )}
                        <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-slate-500">
                          <span>{fmtTime(e.timestamp)}</span>
                          {e.command && <span className="font-mono">{e.command}</span>}
                          {e.version && <span>v{e.version}</span>}
                          {e.os && <span>{e.os}</span>}
                          {e.production === false && <span className="badge badge-muted">test</span>}
                        </div>
                      </div>
                      {!hidden && (
                        <button
                          type="button"
                          onClick={() => dismiss([id])}
                          className="shrink-0 rounded border border-ink-700 px-2 py-0.5 text-[11px] text-slate-500 transition hover:border-brand/50 hover:text-brand"
                        >
                          dismiss
                        </button>
                      )}
                    </div>
                    {e.stack && (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-xs text-slate-500 transition hover:text-brand">
                          stack trace
                        </summary>
                        <pre className="mt-2 overflow-x-auto rounded-md bg-ink-900 p-3 font-mono text-[11px] leading-relaxed text-slate-400">
                          {e.stack}
                        </pre>
                      </details>
                    )}
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </div>
    </div>
  )
}
