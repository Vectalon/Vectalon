import { renderCommand } from '../../src/cli/commands/render'
import { createTempProject, cleanup } from '../helpers/tmp'

jest.mock('@vectalon-dev/core', () => ({
  requireTier: () => ({ allowed: true, currentTier: 'pro', requiredTier: 'pro', canTrial: false }),
}))

describe('renderCommand', () => {
  let stdoutSpy: jest.SpyInstance

  beforeEach(() => {
    stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true)
  })

  afterEach(() => {
    stdoutSpy.mockRestore()
    process.exitCode = undefined
  })

  it('renders a project file headlessly and prints the report', async () => {
    const dir = createTempProject({
      'src/App.tsx': 'import { Text } from "react-native"; export default function App() { return <Text>CLI Render</Text> }',
    })
    try {
      await renderCommand(dir, { entry: 'src/App.tsx' })
      const output = stdoutSpy.mock.calls.map(c => String(c[0])).join('')
      expect(output).toContain('status: rendered')
      expect(output).toContain('renderer: shim')
      expect(output).toContain('CLI Render')
    } finally {
      cleanup(dir)
    }
  })

  it('prints JSON with the structured result', async () => {
    const dir = createTempProject({
      'src/Broken.tsx': 'import { View } from "react-native"; export default function B() { return <View>',
    })
    try {
      await renderCommand(dir, { entry: 'src/Broken.tsx', json: true })
      const output = stdoutSpy.mock.calls.map(c => String(c[0])).join('')
      const parsed = JSON.parse(output) as { ok: boolean; compiled: { ok: boolean; error?: string }[] }
      expect(parsed.ok).toBe(false)
      expect(parsed.compiled[0]?.ok).toBe(false)
      expect(parsed.compiled[0]?.error).toBeTruthy()
    } finally {
      cleanup(dir)
    }
  })

  it('exits with a usage error when no entry is given', async () => {
    const dir = createTempProject({})
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called')
    })
    const stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true)
    try {
      await expect(renderCommand(dir, {})).rejects.toThrow('process.exit called')
      expect(stderrSpy.mock.calls.join('')).toContain('Pass --entry')
    } finally {
      exitSpy.mockRestore()
      stderrSpy.mockRestore()
      cleanup(dir)
    }
  })
})
