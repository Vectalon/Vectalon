export class TestWriter {
  writeForComponent(componentPath: string, componentName: string, framework = 'jest'): string {
    if (framework === 'jest') {
      return this.jestTest(componentPath, componentName)
    }
    return this.detoxTest(componentName)
  }

  private jestTest(path: string, name: string): string {
    return [
      `import React from 'react'`,
      "import { render } from '@testing-library/react-native'",
      `import ${name} from '${path}'`,
      '',
      `describe('${name}', () => {`,
      `  it('renders correctly', () => {`,
      `    const { getByTestId } = render(<${name} />)`,
      `    expect(getByTestId('${name.toLowerCase()}-container')).toBeDefined()`,
      '  })',
      '',
      `  it('matches snapshot', () => {`,
      `    const tree = render(<${name} />).toJSON()`,
      '    expect(tree).toMatchSnapshot()',
      '  })',
      '})',
      '',
    ].join('\n')
  }

  private detoxTest(name: string): string {
    return [
      `describe('${name}', () => {`,
      `  beforeAll(async () => {`,
      `    await device.launchApp()`,
      '  })',
      '',
      `  it('should display ${name} screen', async () => {`,
      `    await expect(element(by.id('${name.toLowerCase()}-container'))).toBeVisible()`,
      '  })',
      '})',
      '',
    ].join('\n')
  }
}
