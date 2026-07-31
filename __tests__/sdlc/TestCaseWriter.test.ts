import { TestCaseWriter } from '../../src/sdlc/TestCaseWriter'

const CRITERIA = [
  '## Acceptance Criteria',
  '',
  '- Given the user has access, when they reset their password, then the reset succeeds.',
  '- Given invalid input, when they reset their password, then they see an error.',
].join('\n')

describe('TestCaseWriter', () => {
  it('generates a Jest test file from Given/When/Then criteria', () => {
    const tests = new TestCaseWriter().writeTestCases(CRITERIA, 'PasswordReset')
    expect(tests).toContain("describe('PasswordReset'")
    expect(tests).toContain("it('the reset succeeds'")
    expect(tests).toContain("it('they see an error'")
    expect(tests).toContain('Given the user has access')
    expect(tests).toContain('When they reset their password')
  })

  it('defaults the component name', () => {
    const tests = new TestCaseWriter().writeTestCases(CRITERIA)
    expect(tests).toContain("describe('Component'")
  })

  it('produces a valid test file when no criteria are present', () => {
    const tests = new TestCaseWriter().writeTestCases('')
    expect(tests).toContain("it('")
    expect(tests).toContain('expect(')
  })
})
