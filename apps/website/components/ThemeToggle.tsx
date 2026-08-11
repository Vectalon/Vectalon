'use client'

import { useEffect, useState } from 'react'
import { Sun, Moon } from '@phosphor-icons/react'

type Theme = 'light' | 'dark'

function currentTheme(): Theme {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'
}

/**
 * Light/dark override for the header. The bootstrap script in layout.tsx
 * already honours localStorage['vectalon-theme'] and sets data-theme before
 * paint — this button just writes that key and flips the attribute live.
 * Initial state stays 'dark' for SSR/hydration parity; the real theme is
 * read in an effect after mount so server and client render identically.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('dark')

  useEffect(() => {
    setTheme(currentTheme())
  }, [])

  function toggle() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark'
    try {
      localStorage.setItem('vectalon-theme', next)
    } catch {
      /* private mode / storage disabled — the attribute flip still works */
    }
    document.documentElement.dataset.theme = next
    setTheme(next)
  }

  const label = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      title={label}
      className="grid h-9 w-9 place-items-center rounded-md border border-ink-700 bg-ink-900/40 text-slate-300 transition hover:border-brand/60 hover:text-brand focus:outline-none focus:ring-2 focus:ring-brand/50"
    >
      {theme === 'dark' ? (
        <Sun size={17} weight="regular" aria-hidden />
      ) : (
        <Moon size={17} weight="regular" aria-hidden />
      )}
    </button>
  )
}
