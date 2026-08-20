'use client'

import { useEffect, useState } from 'react'
import { Sun, Moon } from '@phosphor-icons/react'

type Theme = 'light' | 'dark'

function currentTheme(): Theme {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
}

/**
 * Light/dark override for the statusline header. The bootstrap script in
 * layout.tsx already honours localStorage['vectalon-theme'] and adds .dark
 * class before paint — this button just writes that key and toggles the
 * class live. Initial state stays 'dark' for SSR/hydration parity; the
 * real theme is read in an effect after mount so server and client render
 * identically.
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
      /* private mode / storage disabled — the class flip still works */
    }
    if (next === 'dark') {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
    setTheme(next)
  }

  const label = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      title={label}
      className="seg hover:!text-brand"
    >
      {/* key={theme} remounts the glyph so the swap animation replays */}
      <span key={theme} className="icon-swap grid place-items-center">
        {theme === 'dark' ? (
          <Sun size={15} weight="regular" aria-hidden />
        ) : (
          <Moon size={15} weight="regular" aria-hidden />
        )}
      </span>
      <span className="hidden sm:inline">{theme === 'dark' ? 'light' : 'dark'}</span>
    </button>
  )
}
