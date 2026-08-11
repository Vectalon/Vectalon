import Link from 'next/link'
import { LogoutButton } from './components/LogoutButton'

const LINKS = [
  { href: '/admin', label: 'Overview', icon: '◉' },
  { href: '/admin/licenses', label: 'Licenses', icon: '🔑' },
  { href: '/admin/trials', label: 'Trials', icon: '🧪' },
  { href: '/admin/customers', label: 'Customers', icon: '👤' },
  { href: '/admin/usage', label: 'Feature usage', icon: '📊' },
  { href: '/admin/errors', label: 'Client errors', icon: '⚠' },
]

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-[70vh] max-w-7xl gap-8 px-4 py-10">
      <aside className="hidden w-52 shrink-0 flex-col gap-1 md:flex">
        <div className="mb-4 px-2">
          <div className="font-mono text-sm font-bold text-slate-50">vectalon<span className="text-brand">/admin</span></div>
          <div className="mt-1 text-xs text-slate-500">License — revenue — trials</div>
        </div>
        {LINKS.map(l => (
          <Link
            key={l.href}
            href={l.href}
            className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-slate-300 transition hover:bg-ink-800 hover:text-slate-50"
          >
            <span className="w-4 text-center text-xs">{l.icon}</span>
            {l.label}
          </Link>
        ))}
        <div className="mt-6 border-t border-ink-700/60 pt-4">
          <LogoutButton />
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <div className="mb-6 flex items-center justify-between border-b border-ink-700/60 pb-4 md:hidden">
          <span className="font-mono text-sm font-bold text-slate-50">vectalon<span className="text-brand">/admin</span></span>
          <LogoutButton />
        </div>
        {children}
      </div>
    </div>
  )
}
