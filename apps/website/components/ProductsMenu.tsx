'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'

const PRODUCTS = [
  { slug: 'react-native', name: 'React Native', status: 'live', statusLabel: 'Live', hint: 'v0.1.30 · MCP + harness' },
  { slug: 'ios', name: 'iOS', status: 'soon', statusLabel: 'In development', hint: 'Swift · SwiftUI · codegen' },
  { slug: 'android', name: 'Android', status: 'soon', statusLabel: 'In development', hint: 'Kotlin · Gradle · new arch' },
  { slug: 'flutter', name: 'Flutter', status: 'soon', statusLabel: 'In development', hint: 'Dart · pub.dev · widgets' },
]

export function ProductsMenu() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  return (
    <div
      className="relative"
      ref={ref}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="flex items-center gap-1.5 transition hover:text-brand"
      >
        Products
        <span className={`text-[10px] text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`}>▼</span>
      </button>
      {open && (
        <div className="absolute left-1/2 top-full mt-3 w-72 -translate-x-1/2 rounded-lg border border-ink-700 bg-ink-800 p-1.5 shadow-2xl shadow-black/50">
          {PRODUCTS.map(p => (
            <Link
              key={p.slug}
              href={`/sdk/${p.slug}`}
              onClick={() => setOpen(false)}
              className="flex items-center justify-between gap-3 rounded-md px-3 py-2.5 transition hover:bg-ink-700/60"
            >
              <span>
                <span className="block text-sm font-medium text-white">{p.name}</span>
                <span className="block text-xs text-slate-500">{p.hint}</span>
              </span>
              <span className={`badge ${p.status === 'live' ? 'badge-ok' : 'badge-muted'}`}>{p.statusLabel}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
