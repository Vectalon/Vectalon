export interface TestPlanInput {
  feature: string
  scope?: string[]
  environments?: string[]
}

export class TestPlanWriter {
  writeTestPlan(input: TestPlanInput): string {
    const { feature, scope = [], environments = [] } = input
    const scopeList = scope.length ? scope.map(s => `- ${s}`).join('\n') : '- TBD'
    const envList = environments.length ? environments.map(e => `- ${e}`).join('\n') : '- TBD'

    return [
      `# Test Plan — ${feature}`,
      '',
      '## Scope',
      '',
      `- ${feature}`,
      scopeList,
      '',
      '## Test Environments',
      '',
      envList,
      '',
      '## Test Types',
      '',
      '- Functional',
      '- Regression',
      '- Integration',
      '- Performance',
      '- Accessibility',
      '- User Acceptance',
      '',
      '## Entry Criteria',
      '',
      '- Feature code complete and reviewed',
      '- Dev environment deployed',
      '',
      '## Exit Criteria',
      '',
      '- All critical and high severity tests pass',
      '- No open critical bugs',
      '',
      '## Test Cases',
      '',
      '- TBD',
      '',
      '## Sign-off',
      '',
      '- TBD',
      '',
    ].join('\n')
  }
}
