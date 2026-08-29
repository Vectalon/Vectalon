import { checkCapabilityAvailability, type CapabilityCatalog, type CapabilityDeclaration } from '@vectalon-dev/core'
import catalogData from './catalog.json'
import surfaces from './surfaces.json'
import pkg from '../../package.json'

export const capabilityCatalog = catalogData as CapabilityCatalog
const bySurface = new Map(surfaces.map(surface => [surface.key, surface.capabilityId]))

export class CapabilityUnavailableError extends Error {
  constructor(public readonly surface: string, public readonly reason: string) {
    super(`${surface} unavailable: ${reason}. Experimental access requires --experimental or VECTALON_EXPERIMENTAL=1; entitlement checks still apply.`)
    this.name = 'CapabilityUnavailableError'
  }
}

export function surfaceCapability(surface: string): CapabilityDeclaration | undefined {
  return capabilityCatalog.capabilities.find(entry => entry.id === bySurface.get(surface))
}

export function surfaceAvailability(surface: string, experimentalOptIn = process.env.VECTALON_EXPERIMENTAL === '1') {
  return checkCapabilityAvailability(capabilityCatalog, {
    capabilityId: bySurface.get(surface) || 'unregistered', productVersion: pkg.version, experimentalOptIn,
  })
}

export function capabilityLabel(surface: string): string {
  const entry = surfaceCapability(surface)
  if (!entry) return '[unregistered]'
  const notice = entry.deprecation
    ? `; migration: ${entry.deprecation.migrationReference}; removal: ${entry.deprecation.removalVersion}; license: ${entry.deprecation.licenseEffect}`
    : ''
  return `[${entry.lifecycle}${notice}]`
}

/** Availability never changes entitlement or dev-mode state. Warnings stay local. */
export function assertSurfaceAvailable(surface: string, experimentalOptIn?: boolean, warn: (message: string) => void = console.warn): void {
  const decision = surfaceAvailability(surface, experimentalOptIn)
  if (!decision.available) throw new CapabilityUnavailableError(surface, decision.reason)
  if (surfaceCapability(surface)?.deprecation) warn(`${surface} ${capabilityLabel(surface)}`)
}

export function interactiveChoices<T extends { value: string; label: string }>(choices: T[]): T[] {
  return choices.filter(choice => choice.value === 'help' || surfaceAvailability(`cli:${choice.value}`).available)
    .map(choice => choice.value === 'help' ? choice : { ...choice, label: `${choice.label} ${capabilityLabel(`cli:${choice.value}`)}` })
}

export async function dispatchInteractive<T>(action: string, run: () => Promise<T>): Promise<T> {
  if (action !== 'help') assertSurfaceAvailable(`cli:${action}`)
  return run()
}
