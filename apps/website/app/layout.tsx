import type { Metadata } from 'next'
import { Space_Grotesk, JetBrains_Mono } from 'next/font/google'
import './globals.css'
import Link from 'next/link'
import { ProductsMenu } from '../components/ProductsMenu'
import { ThemeToggle } from '../components/ThemeToggle'

const display = Space_Grotesk({ subsets: ['latin'], variable: '--font-display', display: 'swap' })
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono', display: 'swap' })

export const metadata: Metadata = {
  title: 'Vectalon — the AI harness that lives in your terminal',
  description:
    'Vectalon scans your React Native, iOS, Android, and Flutter projects, builds a living knowledge base, and powers an MCP-aware agent that generates, reviews, upgrades, and heals your code.',
}

const NAV = [
  { href: '/benchmarks', label: 'Benchmarks' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/docs', label: 'Docs' },
  { href: '/changelog', label: 'Changelog' },
]

const themeScript = `
  (function () {
    try {
      var t = localStorage.getItem('vectalon-theme');
      if (t !== 'light' && t !== 'dark') {
        t = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      }
      document.documentElement.setAttribute('data-theme', t);
    } catch (e) {}
  })();
`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="flex min-h-screen flex-col">
        <header className="sticky top-0 z-40 border-b border-ink-700/60 bg-ink/85 backdrop-blur">
          <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
            <Link href="/" className="flex items-center gap-2.5 font-mono font-bold tracking-tight text-slate-50">
              <span className="grid h-7 w-7 place-items-center rounded-md bg-brand text-sm font-black text-on-brand">
                ▣
              </span>
              vectalon<span className="text-brand">.in</span>
            </Link>
            <nav className="hidden items-center gap-7 text-sm text-slate-300 lg:flex">
              <ProductsMenu />
              {NAV.map(item => (
                <Link key={item.href} href={item.href} className="transition hover:text-brand">
                  {item.label}
                </Link>
              ))}
            </nav>
            <div className="flex items-center gap-3">
              <ThemeToggle />
              <Link href="/trial" className="btn-primary !px-4 !py-2 text-xs">
                Get started
              </Link>
            </div>
          </div>
        </header>
        <main className="flex-1">{children}</main>
        <footer className="border-t border-ink-700/60 py-10">
          <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 text-sm text-slate-400 sm:flex-row">
            <div className="font-mono">
              vectalon<span className="text-brand">.in</span> — Business Source License
            </div>
            <div className="flex flex-wrap justify-center gap-6">
              <Link href="/sdk/react-native" className="transition hover:text-brand">
                React Native
              </Link>
              <Link href="/sdk/ios" className="transition hover:text-brand">
                iOS
              </Link>
              <Link href="/sdk/android" className="transition hover:text-brand">
                Android
              </Link>
              <Link href="/sdk/flutter" className="transition hover:text-brand">
                Flutter
              </Link>
            </div>
            <div className="flex gap-6">
              <a href="mailto:support@vectalon.in" className="transition hover:text-brand">
                support@vectalon.in
              </a>
              <Link href="/pricing" className="transition hover:text-brand">
                Pricing
              </Link>
              <Link href="/docs" className="transition hover:text-brand">
                Docs
              </Link>
            </div>
          </div>
        </footer>
      </body>
    </html>
  )
}
