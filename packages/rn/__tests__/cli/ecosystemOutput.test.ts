/**
 * Lock in the refactored `vectalon ecosystem` output contract:
 *  - list is grouped by category with full (never truncated) IDs and
 *    ✓/— status marks, and does NOT dump per-item capabilities
 *  - `--info <id>` renders a single-item card (description, install,
 *    capabilities)
 *
 * logger writes to process.stderr, so capture that (same as doctor.test.ts).
 */
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { ecosystemCommand } from '../../src/cli/commands/ecosystem'
import { verifyPackageOnRegistry } from '../../src/ecosystem'

jest.mock('../../src/ecosystem', () => ({
  ...jest.requireActual('../../src/ecosystem'),
  verifyPackageOnRegistry: jest.fn(async () => ({ exists: true, verified: true, checkedAt: Date.now() })),
}))

function makeProject(enable: string[] = ['metro-mcp', 'maestro']): string {
  const dir = mkdtempSync(join(tmpdir(), 'vectalon-eco-'))
  mkdirSync(join(dir, '.vectalon'), { recursive: true })
  writeFileSync(
    join(dir, 'package.json'),
    JSON.stringify({ name: 'x', dependencies: { 'react-native': '0.85.3' } })
  )
  writeFileSync(
    join(dir, '.vectalon', 'ecosystem.json'),
    JSON.stringify({ version: '1.0.0', enabled: enable })
  )
  return dir
}

// Same ANSI-strip used across the suite (see reporters.test.ts): color codes
// must not leak into assertions.
const ESC = String.fromCharCode(27)
const ANSI_RE = new RegExp(`${ESC}\\[[0-9;]*m`, 'g')

function stripAnsi(s: string): string {
  return s.replace(ANSI_RE, '')
}

function capture(fn: () => void): string {
  const chunks: string[] = []
  const spy = jest.spyOn(process.stderr, 'write').mockImplementation((chunk: string | Uint8Array) => {
    chunks.push(String(chunk))
    return true
  })
  try {
    fn()
  } finally {
    spy.mockRestore()
  }
  return stripAnsi(chunks.join(''))
}

describe('vectalon ecosystem output', () => {
  it('groups the list by category with full IDs and status marks', () => {
    const dir = makeProject()
    const out = capture(() => ecosystemCommand(dir, {}))

    // Section headers
    expect(out).toContain('MCP servers')
    expect(out).toContain('Agent skills')
    expect(out).toContain('Tools')
    expect(out).toContain('Hooks')

    // IDs are never truncated — the longest id appears verbatim
    expect(out).toContain('react-native-upgrader-mcp')
    expect(out).not.toMatch(/react-native-upgrader-mcp…/)

    // Enabled items marked ✓, disabled marked —
    expect(out).toContain('✓ metro-mcp')
    expect(out).toMatch(/\u2014 (zustand|mmkv)/)

    // The old per-item capabilities dump is gone
    expect(out).not.toContain('Capabilities & install:')

    // The commands block teaches --info
    expect(out).toContain('vectalon ecosystem --info <id>')
  })

  it('shows per-item descriptions and an enabled verdict in the list', () => {
    const dir = makeProject()
    const out = capture(() => ecosystemCommand(dir, {}))

    // Verdict: how much of the catalog is live.
    expect(out).toMatch(/\d+ enabled/)
    expect(out).toMatch(/available/)
    // Descriptions render in place (dimmed continuation lines), never truncated.
    expect(out).toContain('CDP-based runtime inspection for Metro/Hermes')
    expect(out).not.toMatch(/…/)
  })

  it('renders --info as a single-item card', () => {
    const dir = makeProject()
    const out = capture(() => ecosystemCommand(dir, { info: 'metro-mcp' }))

    expect(out).toContain('metro-mcp')
    expect(out).toContain('✓ enabled in this project')
    expect(out).toContain('Install')
    expect(out).toContain('npx metro-mcp')
    expect(out).toContain('Capabilities')
  })

  it('reports an unknown --info id', async () => {
    const dir = makeProject()
    const origExit = process.exit
    let exited = false
    process.exit = ((code?: number) => {
      exited = true
      throw new Error(`exit ${code}`)
    }) as typeof process.exit
    try {
      const chunks: string[] = []
      const spy = jest.spyOn(process.stderr, 'write').mockImplementation((chunk: string | Uint8Array) => {
        chunks.push(String(chunk))
        return true
      })
      try {
        // ecosystemCommand is async: the exit mock's throw arrives as an async
        // rejection — await it (and swallow) so it never escapes as unhandled.
        await ecosystemCommand(dir, { info: 'nope-not-real' }).catch(() => {})
      } finally {
        spy.mockRestore()
      }
      expect(stripAnsi(chunks.join(''))).toContain('Unknown ecosystem item')
    } finally {
      process.exit = origExit
    }
    expect(exited).toBe(true)
  })
})

describe('vectalon ecosystem --enable registry validation', () => {
  let dir: string
  const verifyMock = verifyPackageOnRegistry as jest.Mock

  beforeEach(() => {
    // Start with nothing enabled so the 404 test can assert the blocked
    // enable never writes to the config.
    dir = makeProject([])
    verifyMock.mockClear()
  })

  /**
   * Run ecosystemCommand with a process.exit mock that throws. The command is
   * async and the 404 path exits AFTER an await, so the mock's throw arrives
   * as an async rejection — catch it here, and only restore process.exit once
   * the command has settled (otherwise the rejection hits jest's default exit
   * mock after restore and crashes the worker).
   */
  async function runEnable(extra: { force?: boolean } = {}): Promise<{ out: string; exitCode: number | null }> {
    const origExit = process.exit
    let exitCode: number | null = null
    process.exit = ((code?: number) => {
      exitCode = code ?? null
      throw new Error(`exit ${code}`)
    }) as typeof process.exit
    try {
      const chunks: string[] = []
      const spy = jest.spyOn(process.stderr, 'write').mockImplementation((chunk: string | Uint8Array) => {
        chunks.push(String(chunk))
        return true
      })
      try {
        await ecosystemCommand(dir, { enable: 'metro-mcp', ...extra }).catch(() => {
          // process.exit mock rejection — expected for the 404 path
        })
      } finally {
        spy.mockRestore()
      }
      return { out: stripAnsi(chunks.join('')), exitCode }
    } finally {
      process.exit = origExit
    }
  }

  it('refuses to enable an MCP whose package is a confirmed 404', async () => {
    verifyMock.mockResolvedValue({ exists: false, verified: true, checkedAt: Date.now() })
    const { out, exitCode } = await runEnable()
    expect(exitCode).toBe(1)
    expect(out).toContain('does not exist on the npm registry')
    expect(out).toContain('--force')
    // Config was not written — the enable was blocked.
    expect(readFileSync(join(dir, '.vectalon', 'ecosystem.json'), 'utf-8')).not.toContain('metro-mcp')
  })

  it('enables with a warning when the registry is unreachable (offline never blocks)', async () => {
    verifyMock.mockResolvedValue({ exists: true, verified: false, checkedAt: 0 })
    const { out, exitCode } = await runEnable()
    expect(exitCode).toBeNull() // no exit — proceeded
    expect(out).toContain('Could not verify')
    expect(out).toContain('Enabled metro-mcp')
    expect(existsSync(join(dir, '.vectalon', 'ecosystem.json'))).toBe(true)
  })

  it('--force skips the registry check entirely', async () => {
    const { exitCode } = await runEnable({ force: true })
    expect(exitCode).toBeNull()
    expect(verifyPackageOnRegistry).not.toHaveBeenCalled()
  })

  it('enables normally when the package resolves', async () => {
    const { out, exitCode } = await runEnable()
    expect(exitCode).toBeNull()
    expect(verifyPackageOnRegistry).toHaveBeenCalledWith('metro-mcp', dir)
    expect(out).toContain('Enabled metro-mcp')
  })

  it('does not registry-check non-MCP items (skills/tools)', async () => {
    await ecosystemCommand(dir, { enable: 'zustand' })
    expect(verifyPackageOnRegistry).not.toHaveBeenCalled()
  })
})
