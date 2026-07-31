import { RequirementWriter } from '../../src/sdlc/RequirementWriter'

describe('RequirementWriter', () => {
  it('writes a PRD scaffold with all standard sections', () => {
    const prd = new RequirementWriter().writePRD({ projectName: 'Acme', feature: 'Push Notifications' })
    expect(prd).toContain('# Push Notifications — Product Requirements Document')
    expect(prd).toContain('Project: Acme')
    for (const section of [
      '## Overview',
      '## Goals',
      '## Target Audience',
      '## Features',
      '## Success Metrics',
      '## Risks & Dependencies',
      '## Timeline',
    ]) {
      expect(prd).toContain(section)
    }
  })

  it('includes feature ideas and stakeholders', () => {
    const prd = new RequirementWriter().writePRD({
      projectName: 'Acme',
      feature: 'Onboarding',
      featureIdeas: ['one-tap signup'],
      stakeholders: ['Growth', 'Support'],
    })
    expect(prd).toContain('one-tap signup')
    expect(prd).toContain('Growth')
    expect(prd).toContain('Support')
  })

  it('always contains the headline feature', () => {
    const prd = new RequirementWriter().writePRD({ projectName: 'X', feature: 'Camera' })
    expect(prd).toContain('Camera')
  })
})
