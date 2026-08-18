import { PRODUCT_MANIFEST, PRODUCT_PLANS } from '../lib/product-manifest'
import { AGENT_REPOS } from '../lib/agents'

describe('product manifest projections', () => {
  it('drives the public pricing plans from the root product truth', () => {
    expect(PRODUCT_PLANS.map(plan => [plan.id, plan.price, plan.engineTier])).toEqual([
      ['individual', '$19', 'pro'],
      ['team', '$49', 'team'],
      ['enterprise', 'Custom', 'enterprise'],
    ])
  })

  it('matches the real deterministic-agent catalog', () => {
    const reactNative = AGENT_REPOS.find(repo => repo.slug === 'react-native')
    expect(reactNative?.status).toBe('live')
    if (!reactNative || reactNative.status !== 'live') throw new Error('React Native agent catalog is unavailable')
    expect(reactNative.agents).toHaveLength(PRODUCT_MANIFEST.capabilities.deterministicCommands)
  })
})
