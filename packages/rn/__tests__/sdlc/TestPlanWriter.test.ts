import { TestPlanWriter } from '../../src/sdlc/TestPlanWriter'

describe('TestPlanWriter', () => {
  it('writes a test plan scaffold with all standard sections', () => {
    const plan = new TestPlanWriter().writeTestPlan({ feature: 'Onboarding' })
    expect(plan).toContain('# Test Plan — Onboarding')
    for (const section of [
      '## Scope',
      '## Test Environments',
      '## Test Types',
      '## Entry Criteria',
      '## Exit Criteria',
      '## Test Cases',
      '## Sign-off',
    ]) {
      expect(plan).toContain(section)
    }
  })

  it('includes scope and environments', () => {
    const plan = new TestPlanWriter().writeTestPlan({
      feature: 'Onboarding',
      scope: ['camera onboarding', 'signup'],
      environments: ['ios', 'android'],
    })
    expect(plan).toContain('camera onboarding')
    expect(plan).toContain('android')
  })
})
