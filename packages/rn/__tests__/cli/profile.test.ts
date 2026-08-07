import { writeFileSync } from 'fs'
import { join } from 'path'
import { createTempProject, cleanup } from '../helpers/tmp'
import { profileCommand } from '../../src/cli/commands/profile'
import { cpuProfileFixture, heapSnapshotFixture } from '../perf/fixtures'

jest.mock('@vectalon-dev/core', () => ({
  requireTier: jest.fn(() => ({ allowed: true, currentTier: 'pro', requiredTier: 'pro', canTrial: false })),
}))

function projectWithVectalon(files: Record<string, string>): string {
  const dir = createTempProject(files)
  return dir
}

describe('profileCommand', () => {
  let stdoutSpy: jest.SpyInstance

  beforeEach(() => {
    stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true)
  })

  afterEach(() => {
    stdoutSpy.mockRestore()
  })

  it('prints a markdown report with blocking findings', async () => {
    const dir = projectWithVectalon({ '.vectalon/init.json': '{}' })
    const profilePath = join(dir, 'profile.cpuprofile')
    writeFileSync(profilePath, JSON.stringify(cpuProfileFixture(500)))
    try {
      await profileCommand(dir, { profile: profilePath })
      const output = stdoutSpy.mock.calls.map(c => String(c[0])).join('')
      expect(output).toContain('Hermes runtime profile')
      expect(output).toContain('useEffect')
      expect(output).toContain('500ms block at 2ms')
    } finally {
      cleanup(dir)
    }
  })

  it('prints JSON with the analysis payload', async () => {
    const dir = projectWithVectalon({ '.vectalon/init.json': '{}' })
    const heapPath = join(dir, 'heap.heapsnapshot')
    writeFileSync(heapPath, JSON.stringify(heapSnapshotFixture()))
    try {
      await profileCommand(dir, { heap: heapPath, json: true })
      const output = stdoutSpy.mock.calls.map(c => String(c[0])).join('')
      const parsed = JSON.parse(output) as { analysis: { heap: { topRetained: { name: string }[] } } }
      expect(parsed.analysis.heap.topRetained[0].name).toBe('imageCache')
    } finally {
      cleanup(dir)
    }
  })

  it('saves and compares baselines via the knowledge base', async () => {
    const dir = projectWithVectalon({ '.vectalon/init.json': '{}' })
    const profilePath = join(dir, 'profile.cpuprofile')
    try {
      writeFileSync(profilePath, JSON.stringify(cpuProfileFixture(200)))
      await profileCommand(dir, { profile: profilePath, baseline: 'cli', saveBaseline: true })
      writeFileSync(profilePath, JSON.stringify(cpuProfileFixture(600)))
      await profileCommand(dir, { profile: profilePath, baseline: 'cli' })
      const output = stdoutSpy.mock.calls.map(c => String(c[0])).join('')
      expect(output).toContain('regression')
    } finally {
      cleanup(dir)
    }
  })

  it('reports a fatal error when no input is provided', async () => {
    const dir = projectWithVectalon({ '.vectalon/init.json': '{}' })
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called')
    })
    try {
      await expect(profileCommand(dir, {})).rejects.toThrow('process.exit called')
    } finally {
      exitSpy.mockRestore()
      cleanup(dir)
    }
  })
})
