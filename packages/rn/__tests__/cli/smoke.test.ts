/**
 * CLI smoke command tests — --list, --json, report artifacts, exit codes.
 * Business Source License 1.1 (BSL-1.1)
 */
import { tmpdir } from 'os'
import { join } from 'path'
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'fs'
import { smokeCommand } from '../../src/cli/commands/smoke'
import { listSmokeChecks } from '../../src/smoke'

function tempProject(): string {
  const dir = join(tmpdir(), `vectalon-smoke-cli-${Math.random().toString(36).slice(2)}`)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'smoke-test', version: '0.1.0', dependencies: { 'react-native': '0.76.0' } }))
  writeFileSync(join(dir, 'App.tsx'), 'export default function App() { return null }')
  return dir
}

describe('vectalon smoke command', () => {
  const origExit = process.exit
  const origCwd = process.cwd

  beforeEach(() => {
    // Prevent real process exit; capture the code instead.
    process.exit = ((code?: number) => {
      throw new ExitError(code ?? 0)
    }) as typeof process.exit
  })

  afterEach(() => {
    process.exit = origExit
    process.cwd = origCwd
  })

  class ExitError extends Error {
    constructor(public code: number) {
      super(`process.exit(${code})`)
    }
  }

  it('--list prints every check id', async () => {
    const out: string[] = []
    const origWrite = process.stdout.write
    process.stdout.write = ((chunk: unknown) => {
      out.push(String(chunk))
      return true
    }) as typeof process.stdout.write
    try {
      await smokeCommand(tempProject(), { list: true })
    } finally {
      process.stdout.write = origWrite
    }
    const text = out.join('')
    for (const c of listSmokeChecks()) {
      expect(text).toContain(c.id)
    }
  })

  it('runs the real CLI and writes report artifacts', async () => {
    const root = tempProject()
    const outDir = join(root, '.vectalon', 'smoke')
    await smokeCommand(root, { out: '.vectalon/smoke', html: false, only: 'version,status,policy,coverage,telemetry' })
    expect(existsSync(join(outDir, 'report.json'))).toBe(true)
    expect(existsSync(join(outDir, 'report.log'))).toBe(true)
    expect(existsSync(join(outDir, 'report.html'))).toBe(false)
    const report = JSON.parse(readFileSync(join(outDir, 'report.json'), 'utf-8')) as { totals: { fail: number; pass: number; total: number }; flavor: string }
    expect(report.flavor).toBe('rn-cli')
    expect(report.totals.total).toBe(5)
    expect(report.totals.pass).toBe(5)
  })

  it('--json prints the report and does not write files', async () => {
    const root = tempProject()
    const out: string[] = []
    const origWrite = process.stdout.write
    process.stdout.write = ((chunk: unknown) => {
      out.push(String(chunk))
      return true
    }) as typeof process.stdout.write
    try {
      await smokeCommand(root, { json: true, only: 'version' })
    } finally {
      process.stdout.write = origWrite
    }
    const parsed = JSON.parse(out.join('')) as { totals: { pass: number; fail: number }; runs: Array<{ check: { id: string } }> }
    expect(parsed.totals.pass).toBe(1)
    expect(parsed.runs[0].check.id).toBe('version')
    expect(existsSync(join(root, '.vectalon', 'smoke', 'report.json'))).toBe(false)
  })

  it('runs the full fast check set without throwing (project sanity sweep)', async () => {
    // Every deterministic fast check through the real binary — servers are
    // boot-probed, tier-gated and input-dependent commands are skips, and
    // nothing should fail in a well-formed project. The sweep boots the MCP
    // server and daemon for real, so it needs a jest timeout well above the
    // 5s default (CI is slower than a dev machine).
    await smokeCommand(tempProject(), { html: false, out: '.vectalon/smoke', timeoutMs: 60000 })
  }, 120000)
})
