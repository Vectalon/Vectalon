export interface PRDInput {
  projectName: string
  feature: string
  featureIdeas?: string[]
  stakeholders?: string[]
}

export class RequirementWriter {
  writePRD(input: PRDInput): string {
    const { projectName, feature, featureIdeas = [], stakeholders = [] } = input
    const ideaList = featureIdeas.length
      ? featureIdeas.map(i => `- ${i}`).join('\n')
      : '- TBD'
    const stakeholderList = stakeholders.length
      ? stakeholders.map(s => `- ${s}`).join('\n')
      : '- TBD'

    return [
      `# ${feature} — Product Requirements Document`,
      '',
      `Project: ${projectName}`,
      '',
      '## Overview',
      '',
      `${feature} for ${projectName}.`,
      '',
      '## Goals',
      '',
      '- TBD',
      '',
      '## Target Audience',
      '',
      stakeholderList,
      '',
      '## Features',
      '',
      `- ${feature}`,
      ideaList,
      '',
      '## Success Metrics',
      '',
      '- TBD',
      '',
      '## Risks & Dependencies',
      '',
      '- TBD',
      '',
      '## Timeline',
      '',
      '- TBD',
      '',
    ].join('\n')
  }
}
