'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { PRODUCT_MANIFEST } from '../lib/product-manifest'

const PRODUCTS = [
  { slug: 'react-native', name: 'React Native', status: 'live', statusLabel: 'Package available', hint: `v${PRODUCT_MANIFEST.packages.reactNative.version} — capability lifecycle varies by command` },
  { slug: 'ios', name: 'iOS', status: 'soon', statusLabel: 'In development', hint: 'Swift — SwiftUI — codegen' },
  { slug: 'android', name: 'Android', status: 'soon', statusLabel: 'In development', hint: 'Kotlin — Gradle — new arch' },
  { slug: 'flutter', name: 'Flutter', status: 'soon', statusLabel: 'In development', hint: 'Dart — pub.dev — widgets' },
]

export function ProductsMenu() {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<Array<HTMLAnchorElement | null>>([])
  const router = useRouter()

  const navigate = useCallback((href: string) => {
    setOpen(false)
    router.push(href)
  }, [router])

  useEffect(() => {
    // Outside press closes. pointerdown (not mousedown) so touch devices fire
    // it immediately — on iOS a tap that ends in a scroll never produces a
    // mouse event, which would leave the menu stuck open.
    function onDocDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onDocDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDocDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [])

  // Move focus into the menu when it opens so keyboard users land on the
  // first product instead of tabbing through hidden content.
  useEffect(() => {
    if (open) itemRefs.current[0]?.focus()
  }, [open])

  const onMenuKeyDown = useCallback((e: React.KeyboardEvent) => {
    const items = itemRefs.current
    const idx = items.findIndex(el => el === document.activeElement)
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      items[(idx + 1) % items.length]?.focus()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      items[(idx - 1 + items.length) % items.length]?.focus()
    } else if (e.key === 'Home') {
      e.preventDefault()
      items[0]?.focus()
    } else if (e.key === 'End') {
      e.preventDefault()
      items[items.length - 1]?.focus()
    }
  }, [])

  return (
    /* The wrapper is a flex item of the header row: it stretches to the
       full 48px row height (flex), so the button's text centers exactly
       like its sibling nav links — and `top-full` anchors the panel flush
       against the header's bottom edge, never detached from the trigger.
       The panel is a DOM child of this wrapper, so moving the pointer from
       the button into the panel never leaves the wrapper — no dead-zone
       bridge is needed. z-50 keeps the panel above any hero glow below. */
    <div
      className="relative z-50 flex"
      ref={rootRef}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="seg gap-1.5 [touch-action:manipulation]"
      >
        Products
        <span aria-hidden className={`text-[10px] text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`}>▼</span>
      </button>
      {open && (
        <div className="absolute left-0 top-full">
          <div
            role="menu"
            aria-label="Products"
            onKeyDown={onMenuKeyDown}
            className="menu-pop w-80 rounded-[3px] border border-ink-700 bg-ink-800 p-1.5 shadow-2xl shadow-black/60"
          >
            {PRODUCTS.map((p, i) => (
              <Link
                key={p.slug}
                ref={el => {
                  itemRefs.current[i] = el
                }}
                href={`/sdk/${p.slug}`}
                role="menuitem"
                onClick={(e) => { e.preventDefault(); navigate(`/sdk/${p.slug}`) }}
                className="flex items-center justify-between gap-3 rounded-[3px] px-3 py-2.5 transition hover:bg-ink-700/60 focus-visible:bg-ink-700/60 focus-visible:outline-none"
              >
                <span>
                  <span className="block font-mono text-sm font-medium text-slate-50">{p.name}</span>
                  <span className="block text-xs text-slate-500">{p.hint}</span>
                </span>
                <span className={`badge ${p.status === 'live' ? 'badge-ok' : 'badge-muted'}`}>{p.statusLabel}</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
