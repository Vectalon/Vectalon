import type { Metadata } from 'next'
import './globals.css'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Vectalon — the adaptive AI harness for React Native',
  description:
    'Vectalon scans your React Native project, builds a living knowledge base, and powers an MCP-aware agent that generates, reviews, upgrades, and heals your code.',
}

const NAV = [
  { href: '/', label: 'Home' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/docs', label: 'Docs' },
  { href: '/changelog', label: 'Changelog' },
]

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col">
        <header className="sticky top-0 z-40 border-b border-ink-700/60 bg-ink/80 backdrop-blur">
          <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
            <Link href="/" className="flex items-center gap-2 font-mono font-bold text-white">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand text-sm text-ink">▣</span>
              vectalon<span className="text-brand">.in</span>
            </Link>
            <nav className="hidden items-center gap-6 text-sm text-slate-300 sm:flex">
              {NAV.map(item => (
                <Link key={item.href} href={item.href} className="transition hover:text-brand">
                  {item.label}
                </Link>
              ))}
            </nav>
            <div className="flex items-center gap-3">
              <Link href="/admin" className="text-sm text-slate-400 transition hover:text-brand">
                Admin
              </Link>
              <a href="https://github.com/Vectalon/Vectalon" target="_blank" rel="noreferrer" className="btn-ghost !py-1.5">
                GitHub
              </a>
            </div>
          </div>
        </header>
        <main className="flex-1">{children}</main>
        <footer className="border-t border-ink-700/60 py-10">
          <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 text-sm text-slate-400 sm:flex-row">
            <div className="font-mono">
              vectalon<span className="text-brand">.in</span> · Business Source License
            </div>
            <div className="flex gap-6">
              <a href="mailto:support@vectalon.in" className="hover:text-brand">
                support@vectalon.in
              </a>
              <a href="/pricing" className="hover:text-brand">
                Pricing
              </a>
              <a href="/docs" className="hover:text-brand">
                Docs
              </a>
            </div>
          </div>
        </footer>
      </body>
    </html>
  )
}
