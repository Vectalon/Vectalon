import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { detectValidationCommands } from '../../src/utils/validationCommands'

describe('detectValidationCommands', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'vectalon-validation-'))
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('detects React Native CLI default commands when ios/android directories exist', () => {
    writeFileSync(
      join(tmpDir, 'package.json'),
      JSON.stringify({
        name: 'app',
        version: '1.0.0',
        dependencies: { 'react-native': '0.72.0' },
      })
    )
    mkdirSync(join(tmpDir, 'ios'), { recursive: true })
    mkdirSync(join(tmpDir, 'android'), { recursive: true })
    writeFileSync(join(tmpDir, 'android', 'gradlew'), '')

    const detected = detectValidationCommands(tmpDir)
    const names = detected.commands.map(c => c.name)

    expect(names).not.toContain('iOS build')
    expect(names).not.toContain('Android build')
    expect(names).toContain('Android clean')
    expect(names).toContain('Android assemble')
    expect(detected.hasReactNativeCLI).toBe(true)
  })

  it('detects ios pod install when Podfile exists', () => {
    writeFileSync(
      join(tmpDir, 'package.json'),
      JSON.stringify({
        name: 'app',
        version: '1.0.0',
        dependencies: { 'react-native': '0.72.0' },
      })
    )
    mkdirSync(join(tmpDir, 'ios'), { recursive: true })
    writeFileSync(join(tmpDir, 'ios', 'Podfile'), '')

    const detected = detectValidationCommands(tmpDir)
    const pod = detected.commands.find(c => c.name === 'iOS pod install')

    expect(pod).toBeDefined()
    expect(pod?.cmd).toBe('pod')
    expect(pod?.args).toEqual(['install'])
    expect(pod?.cwd).toBe(join(tmpDir, 'ios'))
  })

  it('prefers package.json scripts over RN CLI defaults', () => {
    writeFileSync(
      join(tmpDir, 'package.json'),
      JSON.stringify({
        name: 'app',
        version: '1.0.0',
        dependencies: { 'react-native': '0.72.0' },
        scripts: {
          ios: 'react-native run-ios --simulator',
          android: 'react-native run-android',
          'pod-install': 'cd ios && pod install',
          'android:clean': 'cd android && ./gradlew clean',
        },
      })
    )
    mkdirSync(join(tmpDir, 'ios'), { recursive: true })
    mkdirSync(join(tmpDir, 'android'), { recursive: true })

    const detected = detectValidationCommands(tmpDir, { deviceRun: true })
    const ios = detected.commands.find(c => c.name === 'iOS build')
    const android = detected.commands.find(c => c.name === 'Android build')
    const pods = detected.commands.find(c => c.name === 'iOS pod install')
    const clean = detected.commands.find(c => c.name === 'Android clean')

    expect(ios?.source).toBe('package.json')
    expect(android?.source).toBe('package.json')
    expect(pods?.source).toBe('package.json')
    expect(clean?.source).toBe('package.json')
  })

  it('detects yarn as package manager when yarn.lock exists', () => {
    writeFileSync(
      join(tmpDir, 'package.json'),
      JSON.stringify({
        name: 'app',
        version: '1.0.0',
        dependencies: { 'react-native': '0.72.0' },
        scripts: { ios: 'react-native run-ios' },
      })
    )
    mkdirSync(join(tmpDir, 'ios'), { recursive: true })
    writeFileSync(join(tmpDir, 'yarn.lock'), '')

    const detected = detectValidationCommands(tmpDir, { deviceRun: true })
    expect(detected.packageManager).toBe('yarn')
    const ios = detected.commands.find(c => c.name === 'iOS build')
    expect(ios?.cmd).toBe('yarn')
    expect(ios?.args).toEqual(['ios'])
  })

  it('does not include native commands when project is not a React Native app', () => {
    writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'app', version: '1.0.0' }))
    mkdirSync(join(tmpDir, 'ios'), { recursive: true })
    mkdirSync(join(tmpDir, 'android'), { recursive: true })

    const detected = detectValidationCommands(tmpDir)
    expect(detected.commands).toHaveLength(0)
    expect(detected.hasReactNativeCLI).toBe(false)
  })
})
