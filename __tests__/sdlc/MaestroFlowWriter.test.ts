import { MaestroFlowWriter, criteriaLineToStep, renderMaestroSteps } from '../../src/sdlc/MaestroFlowWriter'

describe('criteriaLineToStep', () => {
  it('maps Given launch lines to launchApp', () => {
    expect(criteriaLineToStep('Given the user opens the app')).toEqual({ kind: 'launchApp' })
    expect(criteriaLineToStep('Given the app is launched')).toEqual({ kind: 'launchApp' })
  })

  it('maps When tap lines to tapOn', () => {
    expect(criteriaLineToStep('When the user taps on "Login"')).toEqual({ kind: 'tapOn', text: 'Login' })
    expect(criteriaLineToStep('When user taps the login button')).toEqual({ kind: 'tapOn', text: 'login button' })
    expect(criteriaLineToStep('When I click on "Submit"')).toEqual({ kind: 'tapOn', text: 'Submit' })
  })

  it('maps When type/enter lines to inputText', () => {
    expect(criteriaLineToStep('When the user types "admin" into the username field')).toEqual({ kind: 'inputText', text: 'admin' })
    expect(criteriaLineToStep('When user enters "secret"')).toEqual({ kind: 'inputText', text: 'secret' })
  })

  it('maps swipes to directional Maestro swipes', () => {
    expect(criteriaLineToStep('When the user swipes up')).toEqual({ kind: 'swipe', direction: 'UP' })
    expect(criteriaLineToStep('When user swipes left')).toEqual({ kind: 'swipe', direction: 'LEFT' })
  })

  it('maps deep links to openLink', () => {
    expect(criteriaLineToStep('When the user opens the deep link "myapp://reset-password"')).toEqual({ kind: 'openLink', url: 'myapp://reset-password' })
  })

  it('maps scroll-until lines to scrollUntilVisible', () => {
    expect(criteriaLineToStep('When the user scrolls until "Checkout" is visible')).toEqual({ kind: 'scrollUntilVisible', text: 'Checkout' })
  })

  it('maps Then visibility lines to assertions', () => {
    expect(criteriaLineToStep('Then the user sees "Welcome"')).toEqual({ kind: 'assertVisible', text: 'Welcome' })
    expect(criteriaLineToStep('Then the login screen is displayed')).toEqual({ kind: 'assertVisible', text: 'login screen' })
    expect(criteriaLineToStep('Then the user does not see "Error"')).toEqual({ kind: 'assertNotVisible', text: 'Error' })
  })

  it('maps unmarked bullet lines by content', () => {
    expect(criteriaLineToStep('- The user sees the dashboard')).toEqual({ kind: 'assertVisible', text: 'dashboard' })
  })

  it('ignores headers and empty lines', () => {
    expect(criteriaLineToStep('## Acceptance Criteria')).toBeNull()
    expect(criteriaLineToStep('')).toBeNull()
  })

  it('maps take-screenshot lines', () => {
    expect(criteriaLineToStep('When the user takes a screenshot')).toEqual({ kind: 'takeScreenshot', name: 'step' })
  })
})

describe('renderMaestroSteps', () => {
  it('renders YAML with proper quoting', () => {
    const lines = renderMaestroSteps([
      { kind: 'launchApp' },
      { kind: 'tapOn', text: 'Sign "In" now' },
      { kind: 'swipe', direction: 'DOWN' },
      { kind: 'scrollUntilVisible', text: 'Footer' },
    ])
    expect(lines[0]).toBe('- launchApp')
    expect(lines[1]).toBe('- tapOn: "Sign \\"In\\" now"')
    expect(lines[2]).toBe('- swipe:\n    direction: DOWN')
    expect(lines[3]).toBe('- scrollUntilVisible:\n    element:\n      text: "Footer"')
  })
})

describe('MaestroFlowWriter', () => {
  it('generates a full flow with header, launch, steps, and final screenshot', () => {
    const writer = new MaestroFlowWriter()
    const flow = writer.writeFlow(
      [
        'Given the user opens the app',
        'When the user taps on "Login"',
        'When the user types "admin" into the username',
        'Then the user sees "Dashboard"',
        'And the user does not see "Error"',
      ].join('\n'),
      { featureName: 'Login Flow', appId: 'com.example.app' }
    )

    expect(flow).toContain('appId: "com.example.app"')
    expect(flow).toContain('---')
    expect(flow).toContain('- launchApp')
    expect(flow).toContain('- tapOn: "Login"')
    expect(flow).toContain('- inputText: "admin"')
    expect(flow).toContain('- assertVisible: "Dashboard"')
    expect(flow).toContain('- assertNotVisible: "Error"')
    expect(flow).toContain('- takeScreenshot: login-flow')
  })

  it('prepends launchApp when the criteria never mention launching', () => {
    const flow = new MaestroFlowWriter().writeFlow('Then the user sees "Home"', { featureName: 'Home' })
    const launchIdx = flow.indexOf('- launchApp')
    const assertIdx = flow.indexOf('- assertVisible: "Home"')
    expect(launchIdx).toBeGreaterThan(-1)
    expect(assertIdx).toBeGreaterThan(launchIdx)
  })

  it('falls back to a launch + feature-name flow for empty criteria', () => {
    const flow = new MaestroFlowWriter().writeFlow('', { featureName: 'Settings' })
    expect(flow).toContain('- launchApp')
    expect(flow).toContain('- takeScreenshot')
  })

  it('uses the placeholder appId when none is provided', () => {
    const flow = new MaestroFlowWriter().writeFlow('Then the user sees "X"')
    expect(flow).toContain('appId: "com.example.app"')
  })
})
