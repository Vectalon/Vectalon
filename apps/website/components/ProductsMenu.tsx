'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'

const PRODUCTS = [
  { slug: 'react-native', name: 'React Native', status: 'live', statusLabel: 'Live', hint: 'v0.8.0 — 29 deterministic agents' },
  { slug: 'ios', name: 'iOS', status: 'soon', statusLabel: 'In development', hint: 'Swift — SwiftUI — codegen' },
  { slug: 'android', name: 'Android', status: 'soon', statusLabel: 'In development', hint: 'Kotlin — Gradle — new arch' },
  { slug: 'flutter', name: 'Flutter', status: 'soon', statusLabel: 'In development', hint: 'Dart — pub.dev — widgets' },
]

export function ProductsMenu() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const firstItemRef = useRef<HTMLAnchorElement>(null)

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [])

  // Move focus into the menu when it opens so keyboard users land on the
  // first product instead of tabbing through hidden content.
  useEffect(() => {
    if (open) firstItemRef.current?.focus()
  }, [open])

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
        aria-haspopup="menu"
        className="seg gap-1.5"
      >
        products
        <span className={`text-[10px] text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`}>▼</span>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute left-1/2 top-full mt-3 w-80 -translate-x-1/2 rounded-[3px] border border-ink-700 bg-ink-800 p-1.5 shadow-2xl shadow-black/60"
        >
          {PRODUCTS.map((p, i) => (
            <Link
              key={p.slug}
              ref={i === 0 ? firstItemRef : undefined}
              href={`/sdk/${p.slug}`}
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center justify-between gap-3 rounded-[3px] px-3 py-2.5 transition hover:bg-ink-700/60"
            >
              <span>
                <span className="block font-mono text-sm font-medium text-slate-50">{p.name}</span>
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
