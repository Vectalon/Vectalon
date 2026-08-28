import status from './capability-status.generated.json'

type Lifecycle = 'planned' | 'experimental' | 'beta' | 'release-candidate' | 'available' | 'deprecated' | 'removed'
type Reason = 'available' | 'unknown-capability' | 'unimplemented' | 'removed' | 'experimental-opt-in-required'
const statuses = status as Record<string, Lifecycle>

export function extensionCommandDecision(command: string, experimentalOptIn: boolean): { available: boolean; reason: Reason } {
  const lifecycle = statuses[command]
  if (!lifecycle) return { available: false, reason: 'unknown-capability' }
  if (lifecycle === 'planned') return { available: false, reason: 'unimplemented' }
  if (lifecycle === 'removed') return { available: false, reason: 'removed' }
  if (lifecycle === 'experimental' && !experimentalOptIn) return { available: false, reason: 'experimental-opt-in-required' }
  return { available: true, reason: 'available' }
}

export function extensionCommandLabel(command: string): string {
  return `[${statuses[command] ?? 'unregistered'}]`
}
