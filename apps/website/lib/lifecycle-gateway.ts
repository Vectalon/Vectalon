/**
 * Server-only adapter for the durable lifecycle registry.
 *
 * The website is a customer-facing gateway, not a signer or policy owner. It
 * asks the durable Admin store whether the presented credential remains valid
 * and projects that result through the approved Admin v1 response envelope.
 */

import { defaultAdminStore } from './admin-store'
import { parseLifecycleCommandResponse, type LifecycleCommandResponse } from './lifecycle-contract'

export type CustomerLifecycleAction = 'activate' | 'refresh'
export type DurableLifecycleAdapter = Readonly<{
  execute(input: Readonly<{ action: CustomerLifecycleAction; credential: string }>): Promise<LifecycleCommandResponse>
}>

type DurableLicenseRegistry = Readonly<{
  validateLicense(credential: string): Promise<{ valid: boolean; reason?: string }>
  recordUsage(feature: string, count?: number): Promise<void>
}>

/** Runtime guard around the published Admin v1 envelope. */
export function durableLifecycleAdapter(execute: (input: Readonly<{ action: CustomerLifecycleAction; credential: string }>) => Promise<unknown>): DurableLifecycleAdapter {
  return {
    async execute(input) {
      try { return parseLifecycleCommandResponse(await execute(input)) }
      catch { return { ok: false, code: 'service_unavailable', retryable: true } }
    },
  }
}

/**
 * The credential is authenticated by the durable registry. No key is minted,
 * no lifecycle transition is decided here, and no credential is persisted in a
 * request log or response error.
 */
export function configuredLifecycleAdapter(): DurableLifecycleAdapter {
  return lifecycleAdapterForStore(defaultAdminStore())
}

/** Adapts the durable registry result to Admin's published response vocabulary. */
export function lifecycleAdapterForStore(store: DurableLicenseRegistry): DurableLifecycleAdapter {
  return durableLifecycleAdapter(async input => {
    const result = await store.validateLicense(input.credential)
    if (!result.valid) {
      const code = result.reason === 'license not found' ? 'not_found' : 'invalid_transition'
      return { contractVersion: '1.0.0', ok: false, error: { code, message: 'license refresh rejected', retryable: false } }
    }
    await store.recordUsage('license_refresh', 1)
    return { contractVersion: '1.0.0', ok: true, credential: input.credential }
  })
}
