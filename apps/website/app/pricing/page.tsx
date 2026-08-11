import Link from 'next/link'
import { checkoutUrlFor, type LsTier } from '../../lib/lemon-squeezy'

const PLANS: Array<{
  name: string
  price: string
  cadence: string
  blurb: string
  features: string[]
  tier?: LsTier
  cta: string
  fallback: string
  href?: string
  highlight?: boolean
}> = [
  {
    name: 'Starter',
    price: '$0',
    cadence: 'free forever',
    blurb: 'For individual developers and open source. Genuinely useful, no card.',
    features: [
      'vectalon init / serve / doctor',
      'Feature workflow (basic)',
      '58 MCP project-aware tools',
      'Local + WASM models',
      'Web intel auto-refresh',
      'Guardrails on save',
    ],
    cta: 'Start free',
    fallback: 'Start free',
    href: '/trial',
  },
  {
    name: 'Pro',
    price: '$19',
    cadence: '/mo or $190/yr',
    blurb: 'For professional developers who need the headline features.',
    features: [
      'Everything in Starter',
      'Upgrade Copilot (rn-diff-purge + codemods)',
      'Self-healing CI generation',
      'Bundle budget guardrails',
      'New Architecture guardrails',
      'Priority LLM inference',
    ],
    tier: 'pro',
    cta: 'Buy Pro',
    fallback: 'Launching soon',
  },
  {
    name: 'All-Access',
    price: '$49',
    cadence: '/mo or $490/yr',
    blurb: 'Every Vectalon SDK — React Native, iOS, Android, Flutter. One license, one auth.',
    features: [
      'Everything in Pro',
      'React Native harness',
      'iOS harness (Swift/SwiftUI)',
      'Android harness (Kotlin)',
      'Flutter harness (Dart)',
      'Cross-platform knowledge graph',
    ],
    tier: 'all-access',
    cta: 'Get All-Access',
    fallback: 'Join the waitlist',
    highlight: true,
  },
  {
    name: 'Team',
    price: '$99',
    cadence: '/seat/mo',
    blurb: 'For engineering teams 5–50 devs. Shared brain, org-wide gates.',
    features: [
      'Everything in All-Access',
      'Team brain / cross-project knowledge',
      'Cloud-synced knowledge base',
      'Custom model endpoints (Azure, Ollama, vLLM)',
      'Usage analytics & policy',
      '5–50 seats',
    ],
    tier: 'team',
    cta: 'Buy Team',
    fallback: 'Contact us',
  },
]

const FAQ = [
  {
    q: 'Is the free tier actually useful?',
    a: 'Yes. init, serve, feature, and doctor work fully offline and cover the daily loop for an individual project. Free means free — no card, no trial countdown.',
  },
  {
    q: 'How does the 14-day trial work?',
    a: 'Premium commands show "Start 14-day Pro trial? [Y/n]". You log in with GitHub once — one trial per GitHub account — and it starts immediately. No credit card.',
  },
  {
    q: 'What does All-Access include?',
    a: 'Every Vectalon SDK: the React Native harness today, and iOS, Android, and Flutter harnesses as they ship. One license key activates every platform via npx vectalon auth.',
  },
  {
    q: 'Why Business Source License?',
    a: 'Source stays visible and free for non-commercial use and small teams (≤3 devs). Commercial use beyond that requires a license. Each release converts to MIT after 4 years.',
  },
  {
    q: 'What happens when a license is revoked?',
    a: 'The CLI validates locally with a cached key and re-checks online periodically — a revoked key stops working within days. Refunds revoke instantly; the admin revocation center makes manual revokes instant too.',
  },
  {
    q: 'Do you store my code?',
    a: 'No. Everything runs locally; the knowledge base lives in your project. Telemetry is opt-in and errors-only. The cloud only handles licensing, trials, and support bundles you choose to upload.',
  },
]

function PlanCta({ plan }: { plan: (typeof PLANS)[number] }) {
  if (plan.href) {
    return (
      <a href={plan.href} className={`mt-8 w-full ${plan.highlight ? 'btn-primary' : 'btn-ghost'}`}>
        {plan.cta}
      </a>
    )
  }
  const url = plan.tier ? checkoutUrlFor(plan.tier) : null
  if (url) {
    return (
      <a href={url} target="_blank" rel="noreferrer" className={`mt-8 w-full ${plan.highlight ? 'btn-primary' : 'btn-ghost'}`}>
        {plan.cta}
      </a>
    )
  }
  // Not configured yet — never ship a dead link.
  const fallbackHref = plan.tier === 'team' ? 'mailto:sales@vectalon.in' : '/sdk/react-native'
  return (
    <a href={fallbackHref} className={`mt-8 w-full ${plan.highlight ? 'btn-accent' : 'btn-ghost'} opacity-90`}>
      {plan.fallback}
    </a>
  )
}

export default function PricingPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-16">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-slate-50">Pricing</h1>
        <p className="mx-auto mt-4 max-w-2xl text-slate-400">
          Global-first USD pricing. The free tier is genuinely useful; the paid tier is for teams
          and hard problems. Trials are one GitHub login, no card.
        </p>
        <p className="mx-auto mt-2 max-w-2xl font-mono text-xs text-slate-500">
          per-platform licenses — <span className="text-brand">All-Access covers every SDK</span> —
          one key via <span className="text-brand">$</span> vectalon auth
        </p>
      </div>

      <div className="mt-12 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {PLANS.map(p => (
          <div
            key={p.name}
            className={`card flex flex-col ${
              p.highlight
                ? 'border-brand/50 bg-ink-800 ring-1 ring-brand/30 terminal-glow'
                : ''
            }`}
          >
            <div className="mb-1 font-mono text-xs font-semibold text-slate-400">{p.name}</div>
            <div className="font-display text-4xl font-bold text-slate-50">
              {p.price}
              <span className="ml-1 text-sm font-normal text-slate-500">{p.cadence}</span>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-slate-400">{p.blurb}</p>
            <ul className="mt-6 flex-1 space-y-2.5 text-sm">
              {p.features.map(f => (
                <li key={f} className="flex gap-2 text-slate-300">
                  <span className="text-brand">✓</span>
                  {f}
                </li>
              ))}
            </ul>
            <PlanCta plan={p} />
          </div>
        ))}
      </div>

      {/* Enterprise banner — kept out of the 4-up so the tier grid stays readable */}
      <div className="mt-5 flex flex-col items-start justify-between gap-4 rounded-xl border border-ink-700 bg-ink-800 p-6 sm:flex-row sm:items-center">
        <div>
          <div className="font-mono text-xs font-semibold text-slate-400">Enterprise</div>
          <div className="mt-1 font-display text-2xl font-bold text-slate-50">50+ developers</div>
          <p className="mt-1.5 max-w-xl text-sm text-slate-400">
            SOC-2, SSO / SAML, on-prem model endpoints, custom licensing terms, and dedicated
            support. Annual pricing.
          </p>
        </div>
        <a href="mailto:sales@vectalon.in" className="btn-ghost shrink-0">
          Talk to us
        </a>
      </div>

      <div className="mt-20">
        <h2 className="text-2xl font-bold text-slate-50">FAQ</h2>
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {FAQ.map(item => (
            <div key={item.q} className="card">
              <h3 className="font-semibold text-slate-50">{item.q}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">{item.a}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
