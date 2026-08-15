'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { NAV } from '../lib/nav'

const PRODUCTS = [
  { slug: 'react-native', name: 'React Native', status: 'live' },
  { slug: 'ios', name: 'iOS', status: 'soon' },
  { slug: 'android', name: 'Android', status: 'soon' },
  { slug: 'flutter', name: 'Flutter', status: 'soon' },
]

/**
 * Mobile navigation (below lg). A tmux-styled dropdown with the product
 * links and pages — the desktop nav is hidden on small screens, so this is
 * the only way in. Closes on link click, outside click, Esc, or route change.
 */
export function MobileMenu() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const pathname = usePathname()

  // Outside click closes.
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  // Esc closes; route change closes.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])
  useEffect(() => {
    setOpen(false)
  }, [pathname])

  return (
    <div className="relative lg:hidden" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-controls="mobile-nav"
        aria-haspopup="menu"
        className="seg hover:!text-brand"
      >
        menu
        <span aria-hidden className={`text-[10px] text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`}>▼</span>
      </button>
      {open && (
        /* pt-2 bridge keeps the panel hoverable across the gap below the
           trigger (same pattern as ProductsMenu). */
        <div className="absolute right-0 top-full z-50 pt-2">
        <div
          id="mobile-nav"
          role="menu"
          className="menu-pop w-72 rounded-[3px] border border-ink-700 bg-ink-800 p-1.5 shadow-2xl shadow-black/60"
        >
          <div className="px-2 pb-1 pt-1.5 font-mono text-[10px] uppercase tracking-wider text-slate-500">
            products
          </div>
          {PRODUCTS.map(p => (
            <Link
              key={p.slug}
              href={`/sdk/${p.slug}`}
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center justify-between rounded-[3px] px-2.5 py-2 transition hover:bg-ink-700/60"
            >
              <span className="font-mono text-sm text-slate-50">{p.name}</span>
              <span className={p.status === 'live' ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-600'}>
                {p.status === 'live' ? '● live' : '○ soon'}
              </span>
            </Link>
          ))}
          <div className="mt-1.5 border-t border-ink-700/60 px-2 pb-1 pt-1.5 font-mono text-[10px] uppercase tracking-wider text-slate-500">
            pages
          </div>
          {NAV.map(item => (
            <Link
              key={item.href}
              href={item.href}
              role="menuitem"
              onClick={() => setOpen(false)}
              className={`flex items-center justify-between rounded-[3px] px-2.5 py-2 transition hover:bg-ink-700/60 ${
                pathname === item.href ? 'bg-brand/15 text-brand' : 'text-slate-50'
              }`}
            >
              {item.label}
            </Link>
          ))}
          <Link
            href="/trial"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="mt-1.5 block bg-brand px-2.5 py-2 text-center text-[13px] font-semibold text-on-brand transition hover:bg-brand-strong"
          >
            Get started
          </Link>
        </div>
        </div>
      )}
    </div>
  )
}
