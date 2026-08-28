/**
 * vc plan — the product plan layer (Free / Individual / Team / Enterprise).
 * Business Source License 1.1 (BSL-1.1)
 *
 * Directive #9: start charging earlier than you think. The engine already
 * has deterministic tier gating (free/pro/team/enterprise via @vectalon-dev/
 * core). This module is the *commercial* surface on top: the three plans
 * customers actually buy, priced to get the first 5 paying teams, with the
 * exact feature split from the roadmap.
 *
 * Plan entitlement and capability availability are independent. Features in
 * the generated manifest are commercial promises; runtime availability comes
 * from the released capability catalog.
 */
import type { Tier } from '@vectalon-dev/core'
import productPlans from './product-plans.generated.json'

export type PlanId = 'free' | 'individual' | 'team' | 'enterprise'

export interface PlanDef {
  id: PlanId
  name: string
  price: string
  cadence: string
  tagline: string
  /** The engine tier this plan unlocks (and everything below it). */
  engineTier: Tier
  /** Commercial feature list — exactly the roadmap's split. */
  features: string[]
  /** Checkout / contact surface. */
  checkout: 'none' | 'checkout' | 'sales'
  trialEligible: boolean
}

const TAGLINES: Record<PlanId, string> = {
  free: 'Local project setup, diagnostics, and basic React Native guardrails.',
  individual: 'Commercial use for one developer, plus qualified Individual capabilities.',
  team: 'Commercial use per purchased developer seat, plus qualified Team capabilities.',
  enterprise: 'Capability, deployment, governance, and support scope defined in the signed order.',
}

export const PLANS: PlanDef[] = productPlans.map(plan => ({
  ...plan,
  id: plan.id as PlanId,
  engineTier: plan.engineTier as Tier,
  checkout: plan.checkout as PlanDef['checkout'],
  tagline: TAGLINES[plan.id as PlanId],
}))

export const PLAN_BY_ID: Record<PlanId, PlanDef> = Object.fromEntries(
  PLANS.map(p => [p.id, p])
) as Record<PlanId, PlanDef>

/**
 * The named product plan an engine tier unlocks.
 */
export function planForTier(tier: Tier | undefined | null): PlanDef {
  switch (tier) {
    case 'team':
      return PLAN_BY_ID.team
    case 'enterprise':
      return PLAN_BY_ID.enterprise
    case 'pro':
      return PLAN_BY_ID.individual
    default:
      return PLAN_BY_ID.free
  }
}

/** Is the given engine tier covered by the plan? */
export function planCovers(plan: PlanId, tier: Tier): boolean {
  const order: Tier[] = ['free', 'pro', 'team', 'enterprise']
  const planTier = PLAN_BY_ID[plan].engineTier
  return order.indexOf(tier) >= 0 && order.indexOf(tier) <= order.indexOf(planTier)
}
