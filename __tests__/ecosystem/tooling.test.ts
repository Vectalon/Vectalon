import { mkdtempSync, writeFileSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { Scanner } from '../../src/harness'
import { detectProjectTooling } from '../../src/adapters'

describe('Expo vs React Native CLI tooling detection', () => {
  let dir: string
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true })
  })

  function makeProject(extra: Record<string, unknown> = {}): string {
    dir = mkdtempSync(join(tmpdir(), 'vectalon-tooling-'))
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({
        name: 'app',
        version: '1.0.0',
        dependencies: { 'react-native': '0.76.0' },
        ...extra,
      })
    )
    return dir
  }

  it('detects a bare React Native CLI project', () => {
    const root = makeProject()
    const snapshot = new Scanner(root).scanProject()
    expect(snapshot.tooling).toBe('rn-cli')
    expect(snapshot.expoSdkVersion).toBe('')
    expect(detectProjectTooling(root)).toBe('rn-cli')
  })

  it('detects an Expo-managed project and SDK version', () => {
    const root = makeProject({ dependencies: { 'react-native': '0.76.0', expo: '~52.0.0' } })
    const snapshot = new Scanner(root).scanProject()
    expect(snapshot.tooling).toBe('expo')
    expect(snapshot.expoSdkVersion).toBe('~52.0.0')
    expect(snapshot.hasExpo).toBe(true)
    expect(detectProjectTooling(root)).toBe('expo')
  })

  it('falls back to rn-cli when package.json is unreadable', () => {
    const root = mkdtempSync(join(tmpdir(), 'vectalon-tooling-empty-'))
    expect(detectProjectTooling(root)).toBe('rn-cli')
  })
})
