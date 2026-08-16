/**
 * vc plan — the commercial plan surface (Individual / Team / Enterprise).
 * Business Source License 1.1 (BSL-1.1)
 *
 * Directive #9: start charging earlier than you think. Shows the current
 * plan (from the license/trial on this machine), what each tier includes,
 * and where to buy. The engine gating (requireTier) stays in @vectalon-dev/
 * core — this is the "what am I paying for" view.
 */
import { resolve, join } from 'path'
import pc from 'picocolors'
import { printCarbonReport, parchment, dim } from '../carbon'
import { LicenseStore, LicenseValidator, TrialTracker } from '@vectalon-dev/core'
import type { Tier } from '@vectalon-dev/core'
import { PLANS, PLAN_BY_ID, planForTier } from '../../billing/plans'
import type { PlanId } from '../../billing/plans'

export interface PlanCommandOptions {
  /** Print machine-readable output. */
  json?: boolean
}

/** Determine the engine tier currently active on this machine. */
export function currentEngineTier(): { tier: Tier; source: 'license' | 'trial' | 'free' } {
  try {
    const license = LicenseStore.read()
    if (license?.key) {
      const validation = LicenseValidator.validate(license.key)
      if (validation.valid && validation.license) {
        const tier = validation.license.tier as Tier
        if (['free', 'pro', 'team', 'enterprise'].includes(tier)) {
          return { tier, source: 'license' }
        }
      }
    }
  } catch {
    // fall through to trial / free
  }
  try {
    const trial = TrialTracker.getInfo()
    if (trial && TrialTracker.isActive()) {
      const tier = trial.tier as Tier
      if (['free', 'pro', 'team', 'enterprise'].includes(tier)) {
        return { tier, source: 'trial' }
      }
    }
  } catch {
    // fall through to free
  }
  return { tier: 'free', source: 'free' }
}

/** Join a price and cadence: "$19" + "/developer/month" → "$19/developer/month", "Custom" + "annual" → "Custom annual". */
export function priceWithCadence(price: string, cadence: string): string {
  return cadence.startsWith('/') ? price + cadence : `${price} ${cadence}`
}

/** The full plan ladder body — one row per commercial tier. */
export function renderPlanLadder(current: PlanId): string[] {
  const lines: string[] = []
  for (const plan of PLANS) {
    const marker = plan.id === current ? pc.bold('▶ ') : '  '
    const name = plan.id === current ? pc.bold(plan.name) : plan.name
    lines.push(`${marker}${name} — ${priceWithCadence(plan.price, plan.cadence)}`)
    lines.push(`      ${dim(plan.tagline)}`)
    for (const f of plan.features) {
      lines.push(`      ${dim('·')} ${f}`)
    }
    if (plan !== PLANS[PLANS.length - 1]) lines.push('')
  }
  return lines
}

export async function planCommand(options: PlanCommandOptions): Promise<void> {
  const root = resolve(process.cwd())
  const { tier, source } = currentEngineTier()
  const current = planForTier(tier)

  if (options.json) {
    process.stdout.write(
      JSON.stringify(
        {
          currentTier: tier,
          source,
          plan: current.id,
          planName: current.name,
          plans: PLANS.map(p => ({ id: p.id, name: p.name, price: p.price, cadence: p.cadence, engineTier: p.engineTier, features: p.features })),
        },
        null,
        2
      ) + '\n'
    )
    return
  }

  const body: string[] = []
  const sourceLabel = source === 'license' ? 'active license' : source === 'trial' ? 'trial' : 'free tier (no license)'
  body.push(`  ${parchment('Current plan:')} ${pc.bold(current.name)}  ${dim(`via ${sourceLabel} (engine tier: ${tier})`)}`)
  body.push(`  ${parchment('Price:')}       ${priceWithCadence(current.price, current.cadence)}`)
  body.push('')
  body.push(`  ${parchment('Included:')}`)
  for (const f of current.features) {
    body.push(`    ${pc.green('✓')} ${f}`)
  }
  body.push('')
  body.push(...renderPlanLadder(current.id))

  printCarbonReport({
    title: 'vectalon plan — what you pay for, and what each tier includes',
    verdict: 'approved',
    lines: body,
    reportPath: join(root, 'docs', 'vectalon', 'plan', 'report.txt'),
    root,
    done:
      tier === 'free'
        ? 'Free tier: every deterministic agent works with zero model calls. Upgrade to Individual ($19/dev/mo) for local AI + diagnostics.'
        : tier === 'enterprise'
          ? `Enterprise — ${PLAN_BY_ID.enterprise.tagline} Contact sales@vectalon.in.`
          : `Your ${current.name} plan unlocks engine tier ${PLAN_BY_ID[current.id].engineTier}.`,
  })
}
