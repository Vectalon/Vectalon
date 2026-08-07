import { mkdirSync, realpathSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { runSandboxed } from '../../src/sandbox/run'
import { createTempProject, cleanup } from '../helpers/tmp'

function sandboxRoot(): string {
  const dir = createTempProject({})
  mkdirSync(join(dir, 'sub'), { recursive: true })
  return dir
}

describe('runSandboxed', () => {
  it('runs a command in the sandbox root and captures stdout', async () => {
    const root = sandboxRoot()
    try {
      const result = await runSandboxed('node', ['-e', 'process.stdout.write("hello-sandbox")'], { root, timeoutMs: 15_000 })
      expect(result.error).toBeUndefined()
      expect(result.ok).toBe(true)
      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain('hello-sandbox')
    } finally {
      cleanup(root)
    }
  })

  it('reports non-zero exit codes', async () => {
    const root = sandboxRoot()
    try {
      const result = await runSandboxed('node', ['-e', 'process.exit(3)'], { root, timeoutMs: 15_000 })
      expect(result.ok).toBe(false)
      expect(result.exitCode).toBe(3)
    } finally {
      cleanup(root)
    }
  })

  it('surfaces spawn failures (missing command)', async () => {
    const root = sandboxRoot()
    try {
      const result = await runSandboxed('vectalon-definitely-not-a-real-binary', [], { root, timeoutMs: 5_000 })
      expect(result.ok).toBe(false)
      // The shell reports the missing binary via exit 127 / stderr rather than a
      // spawn error (the shell itself spawned fine) — either surface is honest.
      const reported = result.error || `${result.signal || result.exitCode} ${result.stderr}`
      expect(reported).toMatch(/not found|ENOENT|127|error/i)
    } finally {
      cleanup(root)
    }
  })

  it('enforces the wall-clock timeout', async () => {
    const root = sandboxRoot()
    try {
      const result = await runSandboxed('node', ['-e', 'setTimeout(() => {}, 30000)'], { root, timeoutMs: 300 })
      expect(result.timedOut).toBe(true)
      expect(result.ok).toBe(false)
    } finally {
      cleanup(root)
    }
  })

  it('caps captured output per stream', async () => {
    const root = sandboxRoot()
    try {
      const result = await runSandboxed(
        'node',
        ['-e', 'process.stdout.write("x".repeat(5000)); process.stderr.write("y".repeat(5000))'],
        { root, timeoutMs: 15_000, maxOutputBytes: 1024 }
      )
      expect(result.stdoutTruncated).toBe(true)
      expect(result.stdout.length).toBeLessThanOrEqual(1024)
      expect(result.stderrTruncated).toBe(true)
      expect(result.stderr.length).toBeLessThanOrEqual(1024)
    } finally {
      cleanup(root)
    }
  })

  it('scrubs ambient secrets from the child environment', async () => {
    const root = sandboxRoot()
    try {
      const before = process.env.GITHUB_TOKEN
      process.env.GITHUB_TOKEN = 'ghp_secret'
      try {
        const result = await runSandboxed('node', ['-e', 'console.log(process.env.GITHUB_TOKEN || "scrubbed")'], {
          root,
          timeoutMs: 15_000,
        })
        expect(result.stdout).toContain('scrubbed')
        expect(result.droppedEnv).toContain('GITHUB_TOKEN')
      } finally {
        if (before === undefined) delete process.env.GITHUB_TOKEN
        else process.env.GITHUB_TOKEN = before
      }
    } finally {
      cleanup(root)
    }
  })

  it('fails fast when the sandbox root does not exist', async () => {
    const result = await runSandboxed('node', ['-e', ''], { root: join(tmpdir(), 'vectalon-missing-root-xyz') })
    expect(result.ok).toBe(false)
    expect(result.error).toContain('does not exist')
  })

  it('makes the sandbox root the working directory', async () => {
    const root = sandboxRoot()
    try {
      const result = await runSandboxed('node', ['-e', 'console.log(process.cwd())'], { root, timeoutMs: 15_000 })
      // The child sees the canonicalized root (macOS /var → /private/var).
      expect(result.stdout.trim()).toBe(realpathSync(root))
    } finally {
      cleanup(root)
    }
  })
})
