import { sandboxCommand } from '../../src/cli/commands/sandbox'
import { createTempProject, cleanup } from '../helpers/tmp'

jest.mock('@vectalon-dev/core', () => ({
  requireTier: () => ({ allowed: true, currentTier: 'pro', requiredTier: 'pro', canTrial: false }),
}))

describe('sandboxCommand', () => {
  let stdoutSpy: jest.SpyInstance

  beforeEach(() => {
    stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true)
  })

  afterEach(() => {
    stdoutSpy.mockRestore()
    process.exitCode = undefined
  })

  it('runs a command and prints the human report', async () => {
    const dir = createTempProject({})
    try {
      await sandboxCommand('node', ['-e', 'console.log("cli-sandbox")'], { root: dir })
      const output = stdoutSpy.mock.calls.map(c => String(c[0])).join('')
      expect(output).toContain('status: ok')
      expect(output).toContain('isolation:')
      expect(output).toContain('cli-sandbox')
    } finally {
      cleanup(dir)
    }
  })

  it('prints JSON with the structured result', async () => {
    const dir = createTempProject({})
    try {
      await sandboxCommand('node', ['-e', 'process.exit(7)'], { root: dir, json: true })
      const output = stdoutSpy.mock.calls.map(c => String(c[0])).join('')
      const parsed = JSON.parse(output) as { ok: boolean; exitCode: number }
      expect(parsed.ok).toBe(false)
      expect(parsed.exitCode).toBe(7)
    } finally {
      cleanup(dir)
    }
  })

  it('honors the allow-env flag', async () => {
    const dir = createTempProject({})
    try {
      const before = process.env.SANDBOX_TEST_FLAG
      process.env.SANDBOX_TEST_FLAG = 'kept'
      try {
        await sandboxCommand('node', ['-e', 'console.log(process.env.SANDBOX_TEST_FLAG || "gone")'], {
          root: dir,
          allowEnv: 'SANDBOX_TEST_FLAG',
          json: true,
        })
        const output = stdoutSpy.mock.calls.map(c => String(c[0])).join('')
        const parsed = JSON.parse(output) as { stdout: string }
        expect(parsed.stdout).toContain('kept')
      } finally {
        if (before === undefined) delete process.env.SANDBOX_TEST_FLAG
        else process.env.SANDBOX_TEST_FLAG = before
      }
    } finally {
      cleanup(dir)
    }
  })

  it('exits with a usage error when no command is given', async () => {
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called')
    })
    const stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true)
    try {
      await expect(sandboxCommand('', [], {})).rejects.toThrow('process.exit called')
      expect(stderrSpy.mock.calls.join('')).toContain('Pass the command')
    } finally {
      exitSpy.mockRestore()
      stderrSpy.mockRestore()
    }
  })
})
