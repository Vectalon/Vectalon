/**
 * vc plan — the commercial plan layer (Individual / Team / Enterprise).
 * Business Source License 1.1 (BSL-1.1)
 *
 * Directive #9: start charging earlier than you think. The engine already
 * has deterministic tier gating (free/pro/team/enterprise via @vectalon-dev/
 * core). This module is the *commercial* surface on top: the three plans
 * customers actually buy, priced to get the first 5 paying teams, with the
 * exact feature split from the roadmap.
 *
 * Individual → engine `pro`  — Local AI + project intelligence + diagnostics
 * Team       → engine `team` — Team Brain, shared policies, PR review, CI,
 *                              shared knowledge, dashboards
 * Enterprise → engine `enterprise` — self-hosted, SSO, audit, private
 *                              models, org-wide policies, multi-repo intel
 */
import type { Tier } from '@vectalon-dev/core'
import productPlans from './product-plans.generated.json'

export type PlanId = 'individual' | 'team' | 'enterprise'

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
  checkout: 'checkout' | 'sales'
  trialEligible: boolean
}

const TAGLINES: Record<PlanId, string> = {
  individual: 'Local AI + project intelligence + diagnostics.',
  team: 'Team Brain, shared policies, PR review, CI, shared knowledge, dashboards.',
  enterprise: 'Self-hosted, SSO, audit, private models, organization-wide policies, multi-repository intelligence.',
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
 * The commercial plan a license tier unlocks. Engine tiers below `pro`
 * (the free tier) map to Individual's feature set — free users get the
 * deterministic agents but not the paid surface.
 */
export function planForTier(tier: Tier | undefined | null): PlanDef {
  switch (tier) {
    case 'team':
      return PLAN_BY_ID.team
    case 'enterprise':
      return PLAN_BY_ID.enterprise
    default:
      return PLAN_BY_ID.individual
  }
}

/** Is the given engine tier covered by the plan? */
export function planCovers(plan: PlanId, tier: Tier): boolean {
  const order: Tier[] = ['free', 'pro', 'team', 'enterprise']
  const planTier = PLAN_BY_ID[plan].engineTier
  return order.indexOf(tier) >= 0 && order.indexOf(tier) <= order.indexOf(planTier)
}
