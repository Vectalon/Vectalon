import { TestWriter } from '../../src/sdlc/TestWriter'

describe('TestWriter', () => {
  it('writes a jest test importing the component', () => {
    const out = new TestWriter().writeForComponent('../components/Button', 'Button', 'jest')
    expect(out).toContain("import Button from '../components/Button'")
    expect(out).toContain("import { render } from '@testing-library/react-native'")
    expect(out).toContain("describe('Button'")
    expect(out).toContain('render(<Button />)')
    expect(out).toContain("getByTestId('button-container')")
    expect(out).toContain('toMatchSnapshot()')
  })

  it('defaults to jest', () => {
    const out = new TestWriter().writeForComponent('../components/Button', 'Button')
    expect(out).toContain('toMatchSnapshot()')
  })

  it('writes a detox e2e test', () => {
    const out = new TestWriter().writeForComponent('../components/Button', 'Button', 'detox')
    expect(out).toContain('await device.launchApp()')
    expect(out).toContain("element(by.id('button-container'))")
    expect(out).toContain('toBeVisible()')
  })
})
