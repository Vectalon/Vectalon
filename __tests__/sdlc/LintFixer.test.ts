import { LintFixer } from '../../src/sdlc/LintFixer'

describe('LintFixer', () => {
  it('maps missing dependency warnings to exhaustive-deps', () => {
    const result = new LintFixer().categorizeLintError("React Hook useEffect has a missing dependency: 'fetchData'")
    expect(result).toMatchObject({
      rule: 'react-hooks/exhaustive-deps',
      severity: 'warning',
    })
  })

  it('maps unused variable warnings to no-unused-vars', () => {
    const result = new LintFixer().categorizeLintError("'foo' is defined but never used")
    expect(result?.rule).toBe('no-unused-vars')
  })

  it('maps console statements to no-console', () => {
    const result = new LintFixer().categorizeLintError('no-console: Unexpected console statement')
    expect(result?.rule).toBe('no-console')
  })

  it('maps let to prefer-const', () => {
    const result = new LintFixer().categorizeLintError("prefer-const: 'count' is never reassigned")
    expect(result?.rule).toBe('prefer-const')
  })

  it('maps conditional hooks to rules-of-hooks as an error', () => {
    const result = new LintFixer().categorizeLintError('React Hooks are called conditionally')
    expect(result).toMatchObject({
      rule: 'rules-of-hooks',
      severity: 'error',
    })
  })

  it('maps import ordering violations', () => {
    const result = new LintFixer().categorizeLintError('Import order is not correct')
    expect(result?.rule).toBe('import/order')
  })

  it('returns null for unrecognized messages', () => {
    expect(new LintFixer().categorizeLintError('something else entirely')).toBeNull()
  })
})
