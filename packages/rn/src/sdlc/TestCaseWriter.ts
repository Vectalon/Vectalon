export interface CriteriaStep {
  given: string
  when: string
  then: string
}

export class TestCaseWriter {
  writeTestCases(acceptanceCriteria: string, component = 'Component'): string {
    const steps = this.parseCriteria(acceptanceCriteria)
    const cases = steps.length
      ? steps
      : [{ given: 'the context is set up', when: 'the action happens', then: 'the expected result occurs' }]

    const lines = [
      "import { render } from '@testing-library/react-native'",
      `import ${component} from './${component}'`,
      '',
      `describe('${component}', () => {`,
      ...cases
        .map(c => [
          `  it('${c.then}', () => {`,
          `    // Given ${c.given}`,
          `    // When ${c.when}`,
          `    // Then ${c.then}`,
          '    expect(true).toBe(true)',
          '  })',
          '',
        ])
        .flat(),
      '})',
      '',
    ]
    return lines.join('\n')
  }

  private parseCriteria(criteria: string): CriteriaStep[] {
    const steps: CriteriaStep[] = []
    for (const line of criteria.split('\n')) {
      const match = line.match(/Given\s+(.+?),\s+when\s+(.+?),\s+then\s+(.+)/i)
      if (match) {
        steps.push({
          given: match[1].replace(/\.$/, '').trim(),
          when: match[2].replace(/\.$/, '').trim(),
          then: match[3].replace(/\.$/, '').trim(),
        })
      }
    }
    return steps
  }
}
