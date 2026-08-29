/**
 * vc plan — commercial plan model tests.
 * Business Source License 1.1 (BSL-1.1)
 */
import { PLANS, PLAN_BY_ID, planForTier, planCovers } from '../../src/billing/plans'
import { renderPlanLadder, priceWithCadence } from '../../src/cli/commands/plan'

describe('commercial plans', () => {
  it('exposes Free explicitly before the three paid plans', () => {
    expect(PLANS.map(p => p.id)).toEqual(['free', 'individual', 'team', 'enterprise'])
  })

  it('ships the roadmap prices: Free $0, Individual $19, Team $49, Enterprise custom', () => {
    expect(PLAN_BY_ID.free.price).toBe('$0')
    expect(PLAN_BY_ID.individual.price).toBe('$19')
    expect(PLAN_BY_ID.team.price).toBe('$49')
    expect(PLAN_BY_ID.enterprise.price).toBe('Custom')
  })

  it('maps each tier to the right engine gate', () => {
    expect(PLAN_BY_ID.free.engineTier).toBe('free')
    expect(PLAN_BY_ID.individual.engineTier).toBe('pro')
    expect(PLAN_BY_ID.team.engineTier).toBe('team')
    expect(PLAN_BY_ID.enterprise.engineTier).toBe('enterprise')
  })

  it('Individual promises only released qualified RN scope and separately labelled beta access', () => {
    const features = PLAN_BY_ID.individual.features.join(' ').toLowerCase()
    expect(features).toContain('vectalon react native for one developer')
    expect(features).toContain('qualified individual capabilities from the released catalog')
    expect(features).toContain('separately labelled beta access')
  })

  it('Team is per purchased developer seat and promises only qualified released scope', () => {
    const features = PLAN_BY_ID.team.features.join(' ').toLowerCase()
    expect(features).toContain('each purchased developer seat')
    expect(features).toContain('qualified team capabilities from the released catalog')
    expect(features).toContain('separately labelled beta access')
  })

  it('qualifies Enterprise deployment and governance capabilities as contracted scope', () => {
    const features = PLAN_BY_ID.enterprise.features.join(' ').toLowerCase()
    expect(features).toContain('scope defined in the signed order')
    expect(features).toContain('only when implemented, tested, and contracted')
    expect(features).not.toContain('sso')
    expect(features).not.toContain('self-hosting')
    expect(features).not.toContain('air-gapped ready')
  })

  it('maps each engine tier to its named product plan', () => {
    expect(planForTier('free').id).toBe('free')
    expect(planForTier('pro').id).toBe('individual')
    expect(planForTier('team').id).toBe('team')
    expect(planForTier('enterprise').id).toBe('enterprise')
    expect(planForTier(undefined).id).toBe('free')
    expect(planForTier(null).id).toBe('free')
  })

  it('planCovers: a plan covers its own tier and below, not above', () => {
    expect(planCovers('individual', 'free')).toBe(true)
    expect(planCovers('individual', 'pro')).toBe(true)
    expect(planCovers('individual', 'team')).toBe(false)
    expect(planCovers('team', 'pro')).toBe(true)
    expect(planCovers('team', 'team')).toBe(true)
    expect(planCovers('team', 'enterprise')).toBe(false)
    expect(planCovers('enterprise', 'enterprise')).toBe(true)
    expect(planCovers('free', 'free')).toBe(true)
    expect(planCovers('free', 'pro')).toBe(false)
  })
})

describe('renderPlanLadder', () => {
  it('marks the current plan with ▶ and shows price + cadence + features', () => {
    const lines = renderPlanLadder('team')
    const joined = lines.join('\n')
    expect(lines[0]).toContain('Free')
    expect(joined).toContain('$0 none')
    expect(joined).toContain('$19/developer/month')
    expect(joined).toContain('$49/developer/month')
    expect(joined).toContain('Custom annual')
    // the current plan is bold-marked
    expect(joined).toContain('▶')
  })

  it('joins price + cadence without doubling the slash or losing the space', () => {
    expect(priceWithCadence('$19', '/developer/month')).toBe('$19/developer/month')
    expect(priceWithCadence('$49', '/developer/month')).toBe('$49/developer/month')
    expect(priceWithCadence('Custom', 'annual')).toBe('Custom annual')
  })

  it('lists every feature of every tier', () => {
    const joined = renderPlanLadder('individual').join('\n')
    for (const plan of PLANS) {
      for (const f of plan.features) {
        expect(joined).toContain(f)
      }
    }
  })
})
