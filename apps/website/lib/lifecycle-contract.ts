/**
 * Thin consumer for the versioned Admin lifecycle response. Policy stays in
 * Admin; this adapter accepts only the published wire envelope and exposes no
 * private record, audit, signer, or credential material.
 */

const CONTRACT_VERSION = '1.0.0'
const ERROR_CODES = new Set([
  'unauthorized', 'invalid_command', 'not_found', 'invalid_transition',
  'revision_conflict', 'idempotency_conflict', 'signing_unavailable', 'service_unavailable',
])
const TERMINAL_LIFECYCLE_STATES = new Set(['suspended', 'expired', 'canceled', 'refunded', 'revoked', 'superseded'])
export type TerminalLifecycleState = 'suspended' | 'expired' | 'canceled' | 'refunded' | 'revoked' | 'superseded'

export type LifecycleCommandResponse =
  | Readonly<{ ok: true; credential?: string }>
  | Readonly<{ ok: false; code: string; retryable: boolean; lifecycle?: TerminalLifecycleState }>

/** Validates just the public envelope needed by activation/refresh clients. */
export function parseLifecycleCommandResponse(value: unknown): LifecycleCommandResponse {
  if (!isObject(value) || value.contractVersion !== CONTRACT_VERSION || typeof value.ok !== 'boolean') return invalid()
  if (value.ok) return typeof value.credential === 'string' && value.credential.length > 0 ? { ok: true, credential: value.credential } : { ok: true }
  if (!isObject(value.error) || typeof value.error.code !== 'string' || typeof value.error.retryable !== 'boolean' || !ERROR_CODES.has(value.error.code)) return invalid()
  const lifecycle = value.error.lifecycle
  if (lifecycle !== undefined && (!TERMINAL_LIFECYCLE_STATES.has(lifecycle as string) || value.error.retryable)) return invalid()
  return { ok: false, code: value.error.code, retryable: value.error.retryable,
    ...(lifecycle === undefined ? {} : { lifecycle: lifecycle as TerminalLifecycleState }) }
}

function invalid(): Readonly<{ ok: false; code: 'contract_invalid'; retryable: false }> {
  return { ok: false, code: 'contract_invalid', retryable: false }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
