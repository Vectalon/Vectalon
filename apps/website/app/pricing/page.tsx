import Link from 'next/link'

const PLANS = [
  {
    name: 'Starter',
    price: '$0',
    cadence: 'free forever',
    blurb: 'For individual developers and open source. Genuinely useful, no card.',
    features: ['vectalon init / serve / doctor', 'Feature workflow (basic)', '58 MCP project-aware tools', 'Local + WASM models', 'Web intel auto-refresh', 'Guardrails on save'],
    cta: 'Start free',
    highlight: false,
  },
  {
    name: 'Pro',
    price: '$19',
    cadence: '/mo or $190/yr',
    blurb: 'For professional developers who need the headline features.',
    features: ['Everything in Starter', 'Upgrade Copilot (rn-diff-purge + codemods)', 'Self-healing CI generation', 'Bundle budget guardrails', 'New Architecture guardrails', 'Priority LLM inference'],
    cta: 'Start 14-day trial',
    highlight: true,
  },
  {
    name: 'Team',
    price: '$99',
    cadence: '/seat/mo',
    blurb: 'For engineering teams 5–50 devs. Shared brain, org-wide gates.',
    features: ['Everything in Pro', 'Team brain / cross-project knowledge', 'Cloud-synced knowledge base', 'Custom model endpoints (Azure, Ollama, vLLM)', 'Usage analytics & policy', '5–50 seats'],
    cta: 'Contact us',
    highlight: false,
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    cadence: 'annual',
    blurb: '50+ devs, SOC-2, SSO, proprietary licensing, dedicated support.',
    features: ['Everything in Team', 'SSO / SAML', 'SOC-2 reports', 'On-prem model endpoints', 'Custom licensing terms', 'Dedicated support'],
    cta: 'Talk to us',
    highlight: false,
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
    q: 'Why Business Source License?',
    a: 'Source stays visible and free for non-commercial use and small teams (≤3 devs). Commercial use beyond that requires a license. Each release converts to MIT after 4 years.',
  },
  {
    q: 'What happens when a license is revoked?',
    a: 'The CLI validates locally with a cached key and re-checks online periodically — a revoked key stops working within days. The admin revocation center makes this instant.',
  },
  {
    q: 'Do you store my code?',
    a: 'No. Everything runs locally; the knowledge base lives in your project. Telemetry is opt-in and errors-only. The cloud only handles licensing, trials, and support bundles you choose to upload.',
  },
]

export default function PricingPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-16">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-white">Pricing</h1>
        <p className="mx-auto mt-4 max-w-2xl text-slate-400">
          Global-first USD pricing. The free tier is genuinely useful; the paid tier is for
          teams and hard problems. Trials are one GitHub login, no card.
        </p>
      </div>

      <div className="mt-12 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {PLANS.map(p => (
          <div
            key={p.name}
            className={`card flex flex-col ${p.highlight ? 'border-brand/60 bg-ink-800 ring-1 ring-brand/40' : ''}`}
          >
            <div className="mb-1 text-sm font-semibold uppercase tracking-wider text-slate-400">{p.name}</div>
            <div className="text-4xl font-bold text-white">
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
            <Link
              href="/trial"
              className={`mt-8 ${p.highlight ? 'btn-primary' : 'btn-ghost'} w-full`}
            >
              {p.cta}
            </Link>
          </div>
        ))}
      </div>

      <div className="mt-20">
        <h2 className="text-2xl font-bold text-white">FAQ</h2>
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {FAQ.map(item => (
            <div key={item.q} className="card">
              <h3 className="font-semibold text-white">{item.q}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">{item.a}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
