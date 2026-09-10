import fixture from '../contracts/admin/license-command-v1.json'
import successFixture from '../contracts/admin/license-command-v1-success.json'
import { parseLifecycleCommandResponse } from '../lib/lifecycle-contract'

describe('Admin lifecycle public contract adapter', () => {
  it('accepts the versioned Admin fixture without importing private lifecycle policy', () => {
    expect(parseLifecycleCommandResponse(fixture.response)).toEqual({
      ok: false,
      code: 'invalid_command',
      retryable: false,
    })
  })

  it('replays the recorded Admin success response without exposing or transforming its credential', () => {
    expect(parseLifecycleCommandResponse(successFixture.response)).toEqual({
      ok: true,
      credential: successFixture.response.credential,
    })
  })

  it('preserves a finite authoritative terminal state only on a non-retryable transition rejection', () => {
    expect(parseLifecycleCommandResponse({ contractVersion: '1.0.0', ok: false, error: { code: 'invalid_transition', retryable: false, lifecycle: 'revoked' } })).toEqual({
      ok: false, code: 'invalid_transition', retryable: false, lifecycle: 'revoked',
    })
    expect(parseLifecycleCommandResponse({ contractVersion: '1.0.0', ok: false, error: { code: 'invalid_transition', retryable: true, lifecycle: 'revoked' } })).toEqual({ ok: false, code: 'contract_invalid', retryable: false })
  })

  it('rejects unsupported versions and malformed responses before they reach a customer endpoint', () => {
    expect(parseLifecycleCommandResponse({ contractVersion: '2.0.0', ok: true })).toEqual({ ok: false, code: 'contract_invalid', retryable: false })
    expect(parseLifecycleCommandResponse({ contractVersion: '1.0.0', ok: false, error: { code: 'unexpected', retryable: false } })).toEqual({ ok: false, code: 'contract_invalid', retryable: false })
  })
})
