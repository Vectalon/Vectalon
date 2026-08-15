'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { NAV } from '../lib/nav'
import { ProductsMenu } from './ProductsMenu'

/**
 * Desktop header navigation (lg+). Marks the current route with the tmux
 * active segment so the user always knows where they are.
 */
export function SiteNav() {
  const pathname = usePathname()
  return (
    <nav className="site-nav hidden items-stretch lg:flex" aria-label="Primary">
      <ProductsMenu />
      {NAV.map(item => (
        <Link
          key={item.href}
          href={item.href}
          className={`seg ${pathname === item.href ? 'seg-active' : ''}`}
          aria-current={pathname === item.href ? 'page' : undefined}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  )
}
