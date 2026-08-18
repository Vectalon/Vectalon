import Link from 'next/link'
import { checkoutUrlFor, type LsTier } from '../../lib/lemon-squeezy'
import { PRODUCT_MANIFEST, PRODUCT_PLANS, type ProductPlanId } from '../../lib/product-manifest'

const PLAN_PRESENTATION: Record<ProductPlanId, {
  blurb: string
  cta: string
  fallback: string
  href?: string
  highlight?: boolean
}> = {
  individual: {
    blurb: 'Local AI + project intelligence + diagnostics. Your source never leaves your machine.',
    cta: 'Buy Individual',
    fallback: 'Launching soon',
  },
  team: {
    blurb: 'Team Brain, shared policies, PR review, CI, shared knowledge, dashboards.',
    cta: 'Buy Team',
    fallback: 'Contact us',
    highlight: true,
  },
  enterprise: {
    blurb: 'Self-hosted, SSO, audit, private models, organization-wide policies, multi-repository intelligence.',
    cta: 'Talk to us',
    fallback: 'Talk to us',
    href: 'mailto:sales@vectalon.in',
  },
}

const PLANS: Array<{
  id: ProductPlanId
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
}> = PRODUCT_PLANS.map(plan => ({
  ...plan,
  ...PLAN_PRESENTATION[plan.id],
  tier: plan.checkout === 'checkout' ? plan.engineTier as LsTier : undefined,
}))

const FAQ = [
  {
    q: 'Is there still a free tier?',
    a: `Yes. init, serve, feature, doctor, and all ${PRODUCT_MANIFEST.capabilities.deterministicCommands} deterministic agents work fully offline and cover the daily loop for an individual project. Free means free — no card, no trial countdown.`,
  },
  {
    q: 'How does the 14-day trial work?',
    a: 'Premium commands show "Start 14-day Individual trial? [Y/n]". You log in with GitHub once — one trial per GitHub account — and it starts immediately. No credit card.',
  },
  {
    q: 'What do the tiers cover, platform-wise?',
    a: 'One license covers every Vectalon SDK: the React Native harness today, and iOS, Android, Flutter, and Python harnesses as they ship — on Individual, Team, and Enterprise alike. `vectalon plan` shows your current plan and what it unlocks.',
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
      <a href={plan.href} className={`mt-6 w-full ${plan.highlight ? 'btn-primary' : 'btn-ghost'}`}>
        {plan.cta}
      </a>
    )
  }
  const url = plan.tier ? checkoutUrlFor(plan.tier) : null
  if (url) {
    return (
      <a href={url} target="_blank" rel="noreferrer" className={`mt-6 w-full ${plan.highlight ? 'btn-primary' : 'btn-ghost'}`}>
        {plan.cta}
      </a>
    )
  }
  // Not configured yet — never ship a dead link.
  const fallbackHref = plan.tier === 'team' ? 'mailto:sales@vectalon.in' : '/sdk/react-native'
  return (
    <a href={fallbackHref} className={`mt-6 w-full ${plan.highlight ? 'btn-accent' : 'btn-ghost'} opacity-90`}>
      {plan.fallback}
    </a>
  )
}

export default function PricingPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-16">
      <div className="text-center">
        <div className="mx-auto mb-5 w-fit">
          <span className="chip font-mono">
            vectalon pricing — <span className="text-brand">three tiers</span> — no card
          </span>
        </div>
        <h1 className="text-4xl font-bold text-slate-50">Pricing</h1>
        <p className="mx-auto mt-4 max-w-2xl text-slate-400">
          Individual for developers, Team for the org, Enterprise for the infrastructure. The free
          tier is genuinely useful; trials are one GitHub login, no card.
        </p>
        <p className="mx-auto mt-2 max-w-2xl font-mono text-xs text-slate-500">
          we're optimizing for the <span className="text-brand">first 5 paying teams</span> — not
          for pricing page psychology. <span className="text-brand">$</span> vectalon plan shows
          your current plan
        </p>
      </div>

      <div className="mt-12 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {PLANS.map(p => (
          <div
            key={p.name}
            className={`console flex flex-col ${
              p.highlight ? '!border-brand/50 terminal-glow' : ''
            }`}
          >
            {/* Frame header — tier name and slot */}
            <div className="console-head">
              <span className="flex items-center gap-2">
                <span className="text-brand">▣</span>
                <span className="text-slate-300">{p.name}</span>
              </span>
              <span className="text-slate-600">[ {p.tier ?? p.name.toLowerCase()} ]</span>
            </div>

            <div className="flex flex-1 flex-col p-5">
              <div className="font-display text-4xl font-bold text-slate-50">
                {p.price}
                <span className="ml-2 text-sm font-normal text-slate-500">{p.cadence}</span>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-slate-400">{p.blurb}</p>

              {/* Terminal-style feature listing */}
              <ul className="mt-5 flex-1 divide-y divide-ink-700/50 border-t border-ink-700/50 font-mono text-[12px]">
                {p.features.map(f => (
                  <li key={f} className="flex items-start gap-2.5 py-2 leading-relaxed">
                    <span className="mt-px shrink-0 text-brand">✓</span>
                    <span className="text-slate-300">{f}</span>
                  </li>
                ))}
              </ul>

              <PlanCta plan={p} />
            </div>
          </div>
        ))}
      </div>

      {/* FAQ — prompt-style Q/A cards */}
      <div className="mt-20">
        <h2 className="text-2xl font-bold text-slate-50">FAQ</h2>
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {FAQ.map(item => (
            <div key={item.q} className="card">
              <h3 className="flex gap-2 font-mono text-sm font-semibold text-slate-50">
                <span className="text-brand">?</span>
                {item.q}
              </h3>
              <p className="mt-2 pl-5 text-sm leading-relaxed text-slate-400">{item.a}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
