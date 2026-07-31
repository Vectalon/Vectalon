import { AccessibilityChecker } from '../../src/sdlc/AccessibilityChecker'

describe('AccessibilityChecker', () => {
  it('flags images without an accessibility label', () => {
    const findings = new AccessibilityChecker().check('<Image source={require("./a.png")} />')
    expect(findings).toEqual(
      expect.arrayContaining([expect.objectContaining({ rule: 'image-no-label', severity: 'error', line: 1 })])
    )
  })

  it('accepts images that have an accessibility label', () => {
    const findings = new AccessibilityChecker().check('<Image accessibilityLabel="logo" source={require("./a.png")} />')
    expect(findings).toEqual([])
  })

  it('flags touchables without an accessibility role', () => {
    const findings = new AccessibilityChecker().check('<TouchableOpacity onPress={go}><Text>Go</Text></TouchableOpacity>')
    expect(findings).toEqual(
      expect.arrayContaining([expect.objectContaining({ rule: 'touchable-no-role', severity: 'warning' })])
    )
  })

  it('flags text inputs without a label', () => {
    const findings = new AccessibilityChecker().check('<TextInput value={email} />')
    expect(findings).toEqual(
      expect.arrayContaining([expect.objectContaining({ rule: 'textinput-no-label', severity: 'warning' })])
    )
  })

  it('reports no findings for clean code', () => {
    expect(new AccessibilityChecker().check('<View><Text>Hi</Text></View>')).toEqual([])
  })
})
