import { AcceptanceCriteriaWriter } from '../../src/sdlc/AcceptanceCriteriaWriter'

describe('AcceptanceCriteriaWriter', () => {
  it('extracts the want from a user story', () => {
    const criteria = new AcceptanceCriteriaWriter().writeAcceptanceCriteria(
      'As a user, I want to reset my password so that I can regain access'
    )
    expect(criteria).toContain('reset my password')
    expect(criteria).toContain('Given')
    expect(criteria).toContain('when')
    expect(criteria).toContain('then')
  })

  it('uses the raw text when no story template is present', () => {
    const criteria = new AcceptanceCriteriaWriter().writeAcceptanceCriteria('upload a profile photo')
    expect(criteria).toContain('upload a profile photo')
  })

  it('always emits at least one criterion even for empty input', () => {
    const criteria = new AcceptanceCriteriaWriter().writeAcceptanceCriteria('')
    expect(criteria.split('Given').length - 1).toBeGreaterThanOrEqual(1)
  })
})
