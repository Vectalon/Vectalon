import {
  parseGuardrailResult,
  failingFindings,
  severityToNumber,
  summarize,
} from '../../extension/src/guardrailResult'

const SAMPLE = JSON.stringify({
  filePath: 'src/api/client.ts',
  passed: 8,
  failed: 2,
  skipped: 1,
  ok: false,
  findings: [
    { rule: 'No console.log statements', severity: 'error', passed: false, message: 'Found console.log call', line: 4 },
    { rule: 'No hardcoded API URLs', severity: 'error', passed: false, message: 'Found hardcoded URL', line: 2 },
    { rule: 'No inline style objects in JSX', severity: 'warning', passed: true },
  ],
})

describe('parseGuardrailResult', () => {
  it('parses a check_guardrails JSON payload', () => {
    const result = parseGuardrailResult(SAMPLE)
    expect(result).not.toBeNull()
    expect(result?.ok).toBe(false)
    expect(result?.findings).toHaveLength(3)
    expect(result?.filePath).toContain('client.ts')
  })

  it('returns null for non-JSON', () => {
    expect(parseGuardrailResult('not json')).toBeNull()
  })

  it('returns null for an unexpected shape', () => {
    expect(parseGuardrailResult('{"hello": 1}')).toBeNull()
  })
})

describe('failingFindings / severityToNumber', () => {
  it('filters to failed rules', () => {
    const result = parseGuardrailResult(SAMPLE) as NonNullable<ReturnType<typeof parseGuardrailResult>>
    const failed = failingFindings(result)
    expect(failed).toHaveLength(2)
    expect(failed.every(f => !f.passed)).toBe(true)
  })

  it('maps severities to VS Code diagnostic numbers', () => {
    expect(severityToNumber('error')).toBe(0)
    expect(severityToNumber('warning')).toBe(1)
    expect(severityToNumber('info')).toBe(2)
  })
})

describe('summarize', () => {
  it('summarizes failures with counts', () => {
    const result = parseGuardrailResult(SAMPLE) as NonNullable<ReturnType<typeof parseGuardrailResult>>
    expect(summarize(result)).toContain('2 issue(s)')
    expect(summarize(result)).toContain('2 error(s)')
  })

  it('reports a clean pass', () => {
    const result = parseGuardrailResult(JSON.stringify({
      filePath: 'a.ts',
      passed: 11,
      failed: 0,
      skipped: 0,
      ok: true,
      findings: [],
    })) as NonNullable<ReturnType<typeof parseGuardrailResult>>
    expect(summarize(result)).toContain('✓ 11 guardrail(s) passed')
  })
})
