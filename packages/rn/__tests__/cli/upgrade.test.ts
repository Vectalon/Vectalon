import { createTempProject, cleanup } from '../helpers/tmp'
import { upgradeCommand } from '../../src/cli/commands/upgrade'

jest.mock('@vectalon-dev/core', () => ({
  requireTier: jest.fn(() => ({ allowed: true, currentTier: 'pro', requiredTier: 'pro', canTrial: false })),
}))

const FIXTURE: Record<string, string> = {
  'package.json': JSON.stringify({
    name: 'app',
    version: '1.0.0',
    dependencies: { react: '18.2.0', 'react-native': '0.72.5' },
  }),
  'android/gradle.properties': 'newArchEnabled=false\n',
  'android/build.gradle': 'enableHermes true\n',
}

describe('upgradeCommand', () => {
  let stdoutSpy: jest.SpyInstance

  beforeEach(() => {
    stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true)
  })

  afterEach(() => {
    stdoutSpy.mockRestore()
  })

  it('prints a JSON plan without writing files (dry-run default)', async () => {
    const dir = createTempProject(FIXTURE)
    try {
      await upgradeCommand(dir, { to: '0.76', json: true })
      const output = stdoutSpy.mock.calls.map(c => String(c[0])).join('')
      const parsed = JSON.parse(output) as { target: string; steps: { id: string }[]; applied: boolean }
      expect(parsed.target).toBe('0.76.0')
      expect(parsed.applied).toBe(false)
      expect(parsed.steps.some(s => s.id === 'dep-react-native')).toBe(true)
    } finally {
      cleanup(dir)
    }
  })

  it('applies codemods with --apply', async () => {
    const dir = createTempProject(FIXTURE)
    try {
      await upgradeCommand(dir, { to: '0.76', apply: true, dryRun: false, json: true, verify: false })
      const output = stdoutSpy.mock.calls.map(c => String(c[0])).join('')
      const parsed = JSON.parse(output) as { applied: boolean; edits: unknown[]; provenance: { manifest: string | null } }
      expect(parsed.applied).toBe(true)
      expect(parsed.edits.length).toBeGreaterThan(0)
      expect(parsed.provenance.manifest).toBeTruthy()
    } finally {
      cleanup(dir)
    }
  })

  it('reports a fatal error (exit 1) for non-RN directories', async () => {
    const dir = createTempProject({ 'README.md': 'hi' })
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called')
    })
    try {
      await expect(upgradeCommand(dir, { json: true })).rejects.toThrow('process.exit called')
    } finally {
      exitSpy.mockRestore()
      cleanup(dir)
    }
  })
})
