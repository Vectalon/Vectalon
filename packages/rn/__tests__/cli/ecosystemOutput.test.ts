/**
 * Lock in the refactored `vectalon ecosystem` output contract:
 *  - list is grouped by category with full (never truncated) IDs and
 *    ✓/— status marks, and does NOT dump per-item capabilities
 *  - `--info <id>` renders a single-item card (description, install,
 *    capabilities)
 *
 * logger writes to process.stderr, so capture that (same as doctor.test.ts).
 */
import { mkdtempSync, writeFileSync, mkdirSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { ecosystemCommand } from '../../src/cli/commands/ecosystem'

function makeProject(): string {
  const dir = mkdtempSync(join(tmpdir(), 'vectalon-eco-'))
  mkdirSync(join(dir, '.vectalon'), { recursive: true })
  writeFileSync(
    join(dir, 'package.json'),
    JSON.stringify({ name: 'x', dependencies: { 'react-native': '0.85.3' } })
  )
  writeFileSync(
    join(dir, '.vectalon', 'ecosystem.json'),
    JSON.stringify({ version: '1.0.0', enabled: ['metro-mcp', 'maestro'] })
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

  it('renders --info as a single-item card', () => {
    const dir = makeProject()
    const out = capture(() => ecosystemCommand(dir, { info: 'metro-mcp' }))

    expect(out).toContain('metro-mcp')
    expect(out).toContain('✓ enabled in this project')
    expect(out).toContain('Install')
    expect(out).toContain('npx metro-mcp')
    expect(out).toContain('Capabilities')
  })

  it('reports an unknown --info id', () => {
    const dir = makeProject()
    const origExit = process.exit
    let exited = false
    process.exit = ((code?: number) => {
      exited = true
      throw new Error(`exit ${code}`)
    }) as typeof process.exit
    try {
      const out = capture(() => {
        try {
          ecosystemCommand(dir, { info: 'nope-not-real' })
        } catch {
          // process.exit mock throws — expected
        }
      })
      expect(out).toContain('Unknown ecosystem item')
    } finally {
      process.exit = origExit
    }
    expect(exited).toBe(true)
  })
})
