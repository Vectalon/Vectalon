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
}

export const PLANS: PlanDef[] = [
  {
    id: 'individual',
    name: 'Individual',
    price: '$19',
    cadence: '/developer/month',
    tagline: 'Local AI + project intelligence + diagnostics.',
    engineTier: 'pro',
    features: [
      'Local AI — your source never leaves your machine',
      'Project intelligence (intel, score, review, sec, arch)',
      'Diagnostics (doctor, build-fix, profile, sandbox, render)',
      'Upgrade copilot + self-healing CI',
      'All 44 deterministic agents, zero model calls',
    ],
    checkout: 'checkout',
  },
  {
    id: 'team',
    name: 'Team',
    price: '$49',
    cadence: '/developer/month',
    tagline: 'Team Brain, shared policies, PR review, CI, shared knowledge, dashboards.',
    engineTier: 'team',
    features: [
      'Everything in Individual',
      'Team Brain — decisions, expertise, shared knowledge across projects',
      'Shared policies + PR review (team-policy, review)',
      'CI + dashboards (ci, coverage, score trends)',
      'Cross-project intelligence + cloud sync (sync)',
    ],
    checkout: 'checkout',
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: 'Custom',
    cadence: 'annual',
    tagline: 'Self-hosted, SSO, audit, private models, organization-wide policies, multi-repository intelligence.',
    engineTier: 'enterprise',
    features: [
      'Everything in Team',
      'Self-hosted deployment (air-gapped ready)',
      'SSO / SAML + audit trails',
      'Private / company-controlled models (Ollama, vLLM)',
      'Organization-wide policies + multi-repository intelligence',
    ],
    checkout: 'sales',
  },
]

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
