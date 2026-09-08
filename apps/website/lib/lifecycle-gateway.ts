/**
 * Server-only adapter for Admin's pinned, in-process lifecycle runtime.
 * The website is a customer-facing gateway, not a policy owner: its adapter
 * derives a customer command server-side and invokes the reviewed Admin service
 * against the durable database without making an Admin network request.
 */

import { configuredInProcessLifecycleAdapter } from './admin-lifecycle/in-process-adapter'
import { parseLifecycleCommandResponse, type LifecycleCommandResponse } from './lifecycle-contract'

export type CustomerLifecycleAction = 'activate' | 'refresh'
export type DurableLifecycleAdapter = Readonly<{
  execute(input: Readonly<{ action: CustomerLifecycleAction; credential: string }>): Promise<LifecycleCommandResponse>
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
  return durableLifecycleAdapter(input => configuredInProcessLifecycleAdapter().execute(input))
}
