import { checkCapabilityAvailability, validateCapabilityCatalog, type CapabilityCatalog } from '@vectalon-dev/core'
import catalogData from '../../../packages/rn/src/capabilities/catalog.json'
import manifest from '../../../product-manifest.json'

export const CAPABILITY_CATALOG = catalogData as CapabilityCatalog
const paidOutcomes: Record<string, string[]> = {
  individual: ['rn.feature.workflow', 'rn.generated-file.repair', 'rn.upgrade-and-fix'],
  team: ['rn.knowledge'],
  enterprise: ['rn.enterprise-controls'],
}

/** New grants only. Never use this decision to revoke or reprice an old contract. */
export function newGrantDecision(input: { tier: string; product?: string; productVersion?: string }): { allowed: boolean; reason: string } {
  const product = input.product ?? 'rn'
  const productVersion = input.productVersion ?? manifest.packages.reactNative.version
  if (product !== 'rn') return { allowed: false, reason: 'product-not-available' }
  if (productVersion !== CAPABILITY_CATALOG.productVersion || productVersion !== manifest.packages.reactNative.version) return { allowed: false, reason: 'product-version-not-available' }
  if (!validateCapabilityCatalog(CAPABILITY_CATALOG).valid) return { allowed: false, reason: 'invalid-capability-qualification' }
  const plan = manifest.plans.find(plan => plan.engineTier === input.tier)
  if (!plan || !plan.productScope.includes(product)) return { allowed: false, reason: 'plan-not-available-for-new-grants' }
  const allowed = (plan.id === 'free' ? ['rn.project.inspect'] : paidOutcomes[plan.id] || []).some(id => {
    const entry = CAPABILITY_CATALOG.capabilities.find(capability => capability.id === id)
    return entry && entry.support.plans.includes(plan.id)
      && (plan.id === 'free' || entry.lifecycle === 'available')
      && checkCapabilityAvailability(CAPABILITY_CATALOG, { capabilityId: id, productVersion }).available
  })
  return { allowed, reason: allowed ? 'qualified' : 'no-available-qualified-outcome' }
}

const planForTier: Record<string, string | undefined> = {
  free: 'free',
  pro: 'individual',
  team: 'team',
  enterprise: 'enterprise',
}

/** Validate only explicitly requested capabilities; tier entitlement alone is independent. */
export function validateExplicitCapabilityGrants(input: {
  tier: string
  product: string
  capabilityIds: readonly string[]
  experimentalOptIn?: boolean
}): string[] {
  if (input.product !== 'rn') throw new Error('product-not-available-for-new-grants')
  if (!validateCapabilityCatalog(CAPABILITY_CATALOG).valid) throw new Error('invalid-capability-qualification')
  const plan = planForTier[input.tier]
  if (!plan) throw new Error('plan-not-available-for-explicit-capability-grants')

  return [...new Set(input.capabilityIds)].map(id => {
    const capability = CAPABILITY_CATALOG.capabilities.find(entry => entry.id === id)
    if (!capability) throw new Error(`unknown-capability: ${id}`)
    if (!capability.implemented) throw new Error(`unimplemented-capability: ${id}`)
    if (!capability.support.plans.includes(plan)) throw new Error(`capability-not-in-plan: ${id}`)
    const decision = checkCapabilityAvailability(CAPABILITY_CATALOG, {
      capabilityId: id,
      productVersion: CAPABILITY_CATALOG.productVersion,
      experimentalOptIn: input.experimentalOptIn,
    })
    if (!decision.available) throw new Error(`${decision.reason}: ${id}`)
    return id
  })
}
