import fixture from '../contracts/admin/license-command-v1.json'
import { parseLifecycleCommandResponse } from '../lib/lifecycle-contract'

describe('Admin lifecycle public contract adapter', () => {
  it('accepts the versioned Admin fixture without importing private lifecycle policy', () => {
    expect(parseLifecycleCommandResponse(fixture.response)).toEqual({
      ok: false,
      code: 'invalid_command',
      retryable: false,
    })
  })

  it('rejects unsupported versions and malformed responses before they reach a customer endpoint', () => {
    expect(parseLifecycleCommandResponse({ contractVersion: '2.0.0', ok: true })).toEqual({ ok: false, code: 'contract_invalid', retryable: false })
    expect(parseLifecycleCommandResponse({ contractVersion: '1.0.0', ok: false, error: { code: 'unexpected', retryable: false } })).toEqual({ ok: false, code: 'contract_invalid', retryable: false })
  })
})
