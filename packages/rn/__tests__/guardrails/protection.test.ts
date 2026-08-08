import { runGuardrails, RULE_CRASH_MESSAGE } from '../../src/guardrails/engine'
import { analyzeSourceGuarded, PARSE_FAILURE_MESSAGE } from '../../src/guardrails/analyze'
import type { GuardrailRule } from '../../src/guardrails'

describe('guardrail parse protection (P0-9)', () => {
  it('degrades a crashing rule to one failed finding instead of throwing', () => {
    const crashing: GuardrailRule = {
      id: 'crash',
      name: 'crash-rule',
      description: 'crashes on purpose',
      severity: 'warning',
      check: () => {
        throw new Error('parser exploded')
      },
    }
    const result = runGuardrails({ filePath: 'x.tsx', content: 'const x = 1', rules: [crashing] })
    expect(result.ok).toBe(false)
    expect(result.failed).toBe(1)
    expect(result.findings).toHaveLength(1)
    expect(result.findings[0].message).toContain(RULE_CRASH_MESSAGE)
    expect(result.findings[0].message).toContain('crash-rule')
    expect(result.findings[0].passed).toBe(false)
  })

  it('degrades a crashing applicability check the same way', () => {
    const crashing: GuardrailRule = {
      id: 'crash-applicable',
      name: 'crash-applicable',
      description: 'crashes in applicable',
      severity: 'error',
      applicable: () => {
        throw new Error('boom')
      },
      check: () => ({ passed: true }),
    }
    const result = runGuardrails({ filePath: 'x.tsx', content: 'x', rules: [crashing] })
    expect(result.failed).toBe(1)
    expect(result.findings[0].message).toContain('applicability check crashed')
  })

  it('healthy rules still run alongside a crashing one', () => {
    const crashing: GuardrailRule = {
      id: 'crash',
      name: 'crash-rule',
      description: 'crashes',
      severity: 'warning',
      check: () => {
        throw new Error('boom')
      },
    }
    const clean: GuardrailRule = {
      id: 'clean',
      name: 'clean-rule',
      description: 'passes',
      severity: 'info',
      check: () => ({ passed: true }),
    }
    const result = runGuardrails({ filePath: 'x.tsx', content: 'x', rules: [clean, crashing] })
    expect(result.passed).toBe(1)
    expect(result.failed).toBe(1)
  })

  it('analyzeSourceGuarded parses a valid TSX file', () => {
    const guarded = analyzeSourceGuarded(
      'export const Button = ({ title }: { title: string }) => <Text>{title}</Text>',
      'Button.tsx'
    )
    expect(guarded.parsed).toBe(true)
    expect(guarded.analysis?.components.length).toBeGreaterThanOrEqual(1)
  })

  it('analyzeSourceGuarded never throws on garbage input', () => {
    const guarded = analyzeSourceGuarded('{{{ definitely not code (((', 'broken.tsx')
    expect(guarded.parsed).toBe(false)
    expect(guarded.analysis).toBeNull()
    expect(guarded.error).toBeTruthy()
    expect(PARSE_FAILURE_MESSAGE).toContain('could not parse file')
  })

  it('analyzeSourceGuarded bails on a pathological AST via the node budget', () => {
    // nodeBudget 1 means the very first node visits exhaust the budget.
    const guarded = analyzeSourceGuarded('const x = 1', 'x.ts', { nodeBudget: 1 })
    expect(guarded.parsed).toBe(false)
    expect(guarded.error).toContain('budget')
  })
})
