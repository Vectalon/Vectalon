import Link from 'next/link'
import { checkoutUrlFor, type LsTier } from '../../lib/lemon-squeezy'
import { PRODUCT_PLANS, type ProductPlanId } from '../../lib/product-manifest'

const PLAN_PRESENTATION: Record<ProductPlanId, {
  blurb: string
  cta: string
  fallback: string
  href?: string
  highlight?: boolean
}> = {
  free: {
    blurb: 'Local project setup, diagnostics, and basic React Native guardrails. No card or trial countdown.',
    cta: 'Get started free',
    fallback: 'Get started free',
    href: '/sdk/react-native',
  },
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
    blurb: 'Qualified deployments with scope, controls, support, and availability confirmed in writing before purchase.',
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
    a: 'Yes. The released catalog identifies the qualified Free capabilities: local project setup, diagnostics, and basic React Native guardrails. Experimental commands require explicit opt-in, are not a purchased promise, and may need configured models, credentials, or network services. No card or trial countdown.',
  },
  {
    q: 'How does the 14-day trial work?',
    a: 'Premium commands show "Start 14-day Individual trial? [Y/n]". You log in with GitHub once — one trial per GitHub account — and it starts immediately. No credit card.',
  },
  {
    q: 'What do the tiers cover, platform-wise?',
    a: 'Current plans cover the React Native harness only. Future SDKs will publish their scope and commercial terms when they are actually available; they are not silently included today.',
  },
  {
    q: 'Why Business Source License?',
    a: 'Source stays visible and free for non-commercial use and small teams (≤3 devs). Commercial use beyond that requires a license. Each release converts to MIT after 4 years.',
  },
  {
    q: 'What happens when a license is revoked?',
    a: 'Online checks observe revocation immediately. Subscription licenses use a maximum 35-day signed offline window and rotate at renewal, so cancelled or refunded access expires when that window ends.',
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
            vectalon pricing — <span className="text-brand">four plans</span> — free means free
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

      <div className="mt-12 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
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
