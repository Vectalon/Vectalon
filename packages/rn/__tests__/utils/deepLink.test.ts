import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { kebabCase, detectUrlScheme, buildDeepLink, deriveScreenFromImplementation } from '../../src/utils/deepLink'
import type { PhaseResult } from '../../src/adapters/types'

describe('deepLink helpers', () => {
  let root: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'vectalon-link-'))
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  describe('kebabCase / buildDeepLink', () => {
    it('kebab-cases PascalCase names', () => {
      expect(kebabCase('LoginScreen')).toBe('login-screen')
      expect(kebabCase('ProfileTab')).toBe('profile-tab')
      expect(kebabCase('already-kebab')).toBe('already-kebab')
      expect(kebabCase('APIScreen')).toBe('api-screen')
    })

    it('builds a scheme://route deep link', () => {
      expect(buildDeepLink('myapp', 'LoginScreen')).toBe('myapp://login-screen')
      expect(buildDeepLink('com.example.app', 'HomeScreen')).toBe('com.example.app://home-screen')
    })
  })

  describe('detectUrlScheme', () => {
    it('reads the Expo scheme from app.json as a string', () => {
      writeFileSync(join(root, 'app.json'), JSON.stringify({ expo: { scheme: 'hvacmobile' } }))
      expect(detectUrlScheme(root)).toBe('hvacmobile')
    })

    it('reads the first Expo scheme when it is an array', () => {
      writeFileSync(join(root, 'app.json'), JSON.stringify({ expo: { scheme: ['primary', 'secondary'] } }))
      expect(detectUrlScheme(root)).toBe('primary')
    })

    it('reads CFBundleURLSchemes from an iOS Info.plist', () => {
      mkdirSync(join(root, 'ios', 'App'), { recursive: true })
      writeFileSync(
        join(root, 'ios', 'App', 'Info.plist'),
        `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<dict>
  <key>CFBundleURLTypes</key>
  <array>
    <dict>
      <key>CFBundleURLSchemes</key>
      <array>
        <string>hvac-app</string>
      </array>
    </dict>
  </array>
</dict>
</plist>
`
      )
      expect(detectUrlScheme(root)).toBe('hvac-app')
    })

    it('falls back to the package name', () => {
      writeFileSync(join(root, 'package.json'), JSON.stringify({ name: '@acme/hvac-mobile' }))
      expect(detectUrlScheme(root)).toBe('acmehvacmobile')
    })

    it('falls back to the directory name when nothing else exists', () => {
      const nested = join(root, 'MyCoolApp')
      mkdirSync(nested, { recursive: true })
      expect(detectUrlScheme(nested)).toBe('mycoolapp')
    })
  })

  describe('deriveScreenFromImplementation', () => {
    const implArtifact = (content: string, path?: string): PhaseResult => ({
      id: 'implementation',
      name: 'Implementation',
      description: '',
      status: 'completed',
      output: content,
      artifacts: [{ type: 'engineering', title: 'x', content, ...(path ? { path } : {}) }],
      completedAt: 1,
    })

    it('finds the generated screen path inside artifact content', () => {
      const phases: PhaseResult[] = [
        implArtifact('Wrote src/screens/LoginScreen.tsx and wired it into the navigation stack.'),
      ]
      expect(deriveScreenFromImplementation(phases)).toBe('LoginScreen')
    })

    it('finds the screen from an artifact path', () => {
      const phases: PhaseResult[] = [implArtifact('x', 'src/screens/OnboardingScreen.tsx')]
      expect(deriveScreenFromImplementation(phases)).toBe('OnboardingScreen')
    })

    it('returns null when no implementation phase produced a screen', () => {
      const phases: PhaseResult[] = [implArtifact('Removed the appcenter dependency from package.json.')]
      expect(deriveScreenFromImplementation(phases)).toBeNull()
      expect(deriveScreenFromImplementation([])).toBeNull()
    })
  })
})
