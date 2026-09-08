import type { LifecycleResult } from './generated/types'

export const LICENSE_COMMAND_CONTRACT_VERSION = '1.0.0' as const

/** The reviewed Admin V1 response projection. Internal errors never escape it. */
export function lifecycleEnvelope(result: LifecycleResult): Record<string, unknown> {
  return result.ok
    ? { contractVersion: LICENSE_COMMAND_CONTRACT_VERSION, ...result }
    : { contractVersion: LICENSE_COMMAND_CONTRACT_VERSION, ok: false, error: { code: result.code, message: result.message, retryable: result.code === 'signing_unavailable' || result.code === 'service_unavailable', ...(result.currentRevision === undefined ? {} : { currentRevision: result.currentRevision }) } }
}
