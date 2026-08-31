import status from './capability-status.generated.json'

export type Lifecycle = 'planned' | 'experimental' | 'beta' | 'release-candidate' | 'available' | 'deprecated' | 'removed'
type Reason = 'available' | 'deprecated' | 'unknown-capability' | 'unimplemented' | 'removed' | 'experimental-opt-in-required'
type Deprecation = {
  noticeVersion: string
  noticeReference: string
  migrationReference: string
  removalVersion: string
  licenseEffect: string
}
export type ExtensionCapabilityStatus = {
  capabilityId: string
  capabilityVersion: string
  lifecycle: Lifecycle
  implemented: boolean
  plans: string[]
  supportTier: string
  deprecation: Deprecation | null
}
type Decision = { available: boolean; reason: Reason; warning?: string }
const statuses = status as Record<string, ExtensionCapabilityStatus>

export function extensionCommandDecisionFrom(records: Record<string, ExtensionCapabilityStatus>, command: string, experimentalOptIn: boolean): Decision {
  const record = records[command]
  if (!record) return { available: false, reason: 'unknown-capability' }
  if (!record.implemented || record.lifecycle === 'planned') return { available: false, reason: 'unimplemented' }
  if (record.lifecycle === 'removed') return { available: false, reason: 'removed' }
  if (record.lifecycle === 'experimental' && !experimentalOptIn) return { available: false, reason: 'experimental-opt-in-required' }
  if (record.lifecycle === 'deprecated') {
    const deprecation = record.deprecation
    const warning = deprecation
      ? `Vectalon: ${command} is deprecated since ${deprecation.noticeVersion}. Migrate via ${deprecation.migrationReference}. Remove in ${deprecation.removalVersion}. ${deprecation.licenseEffect}`
      : `Vectalon: ${command} is deprecated.`
    return { available: true, reason: 'deprecated', warning }
  }
  return { available: true, reason: 'available' }
}

export function extensionCommandDecision(command: string, experimentalOptIn: boolean): Decision {
  return extensionCommandDecisionFrom(statuses, command, experimentalOptIn)
}

export function extensionCommandLabel(command: string): string {
  return `[${statuses[command]?.lifecycle ?? 'unregistered'}]`
}
