/**
 * Smoke suite tests — catalog completeness, runner classification, reporters.
 * Business Source License 1.1 (BSL-1.1)
 */
import { tmpdir } from 'os'
import { join } from 'path'
import { writeFileSync, mkdirSync, existsSync } from 'fs'
import { listSmokeChecks, getSmokeCheck } from '../../src/smoke/catalog'
import {
  runSmoke,
  detectFlavor,
  detectSourceFiles,
  totalsFor,
  cliEntry,
} from '../../src/smoke/runner'
import {
  renderJsonReport,
  renderActivityLog,
  renderTerminalSummary,
  renderHtmlReport,
} from '../../src/smoke/reporters'
import type { SmokeRun } from '../../src/smoke/types'

/** A tiny fake CLI that echoes its args and exits with a configurable code. */
function writeFakeCli(code: number, output: string): string {
  const dir = join(tmpdir(), `vectalon-smoke-bin-${Math.random().toString(36).slice(2)}`)
  mkdirSync(dir, { recursive: true })
  const script = `#!/usr/bin/env node
process.stdout.write(${JSON.stringify(output)} + '\\n')
process.stdout.write('args: ' + process.argv.slice(2).join(' ') + '\\n')
process.exit(${code})
`
  const bin = join(dir, 'vectalon.js')
  writeFileSync(bin, script)
  return bin
}

function fakeContext(bin: string, root?: string) {
  return {
    root: root || tmpdir(),
    bin,
    flavor: 'rn-cli' as const,
    srcFiles: ['App.tsx'],
    devMode: false,
  }
}

function fakeRun(status: SmokeRun['status']): SmokeRun {
  return {
    check: { id: 'x', name: 'X', category: 'cli', args: () => ['x'] },
    status,
    exitCode: status === 'pass' ? 0 : 1,
    durationMs: 10,
    output: 'out',
    reason: status === 'pass' ? undefined : `reason-${status}`,
    args: ['x'],
  }
}

describe('smoke catalog', () => {
  it('covers the full command surface', () => {
    const ids = listSmokeChecks().map(c => c.id)
    for (const expected of [
      'version',
      'help',
      'init',
      'status',
      'models',
      'auth',
      'policy',
      'refresh',
      'suggestions',
      'ecosystem',
      'doctor',
      'impact',
      'coverage',
      'intel',
      'telemetry',
      'bundle',
      'profile',
      'sandbox',
      'render',
      'ci',
      'release',
      'leaderboard',
      'visual-ci',
      'visual-baseline',
      'ci-incident',
      'serve',
      'daemon',
      'sync',
      'team-policy',
      'support',
      'feature',
      'bench',
      'selftest',
      'pull',
    ]) {
      expect(ids).toContain(expected)
    }
    // The slow quartet is gated behind --full.
    for (const slow of ['feature', 'bench', 'selftest', 'pull']) {
      expect(getSmokeCheck(slow)!.slow).toBe(true)
    }
  })

  it('has unique ids', () => {
    const ids = listSmokeChecks().map(c => c.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('profile and sync declare skip reasons', () => {
    expect(getSmokeCheck('profile')!.skipWhen!({} as never)).toContain('input file')
    expect(getSmokeCheck('sync')!.skipWhen!({ root: tmpdir() } as never)).toContain('sync remote')
  })
})

describe('smoke runner', () => {
  it('passes on exit 0 and captures the output', async () => {
    const bin = writeFakeCli(0, 'hello smoke')
    const report = await runSmoke(fakeContext(bin), { only: ['version'] })
    expect(report.totals.pass).toBe(1)
    expect(report.totals.fail).toBe(0)
    const run = report.runs[0]
    expect(run.status).toBe('pass')
    expect(run.output).toContain('hello smoke')
    expect(run.output).toContain('args: --version')
  })

  it('strips ANSI escapes so captured output stays clean', async () => {
    const bin = writeFakeCli(0, '\u001b[36mℹ\u001b[39m bundle gate\u001b[0m\n\u001b[?25l spinner')
    const report = await runSmoke(fakeContext(bin), { only: ['version'] })
    expect(report.runs[0].output).toContain('bundle gate')
    expect(report.runs[0].output).toContain('spinner')
    expect(report.runs[0].output).not.toContain('\u001b[')
  })

  it('runs checks in dev mode by default (VECTALON_DEV_MODE=1, no forced color)', async () => {
    const dir = join(tmpdir(), `vectalon-smoke-env-${Math.random().toString(36).slice(2)}`)
    mkdirSync(dir, { recursive: true })
    const script = `#!/usr/bin/env node
process.stdout.write('dev=' + process.env.VECTALON_DEV_MODE + ' color=' + process.env.FORCE_COLOR + '\\n')
process.exit(0)
`
    const bin = join(dir, 'vectalon.js')
    writeFileSync(bin, script)
    const report = await runSmoke(fakeContext(bin), { only: ['version'] })
    expect(report.runs[0].output).toContain('dev=1 color=0')
  })

  it('respects devMode: false for tier-respecting runs', async () => {
    const dir = join(tmpdir(), `vectalon-smoke-nodev-${Math.random().toString(36).slice(2)}`)
    mkdirSync(dir, { recursive: true })
    const script = `#!/usr/bin/env node
process.stdout.write('dev=' + process.env.VECTALON_DEV_MODE + '\\n')
process.exit(0)
`
    const bin = join(dir, 'vectalon.js')
    writeFileSync(bin, script)
    const report = await runSmoke(fakeContext(bin), { only: ['version'], devMode: false })
    expect(report.runs[0].output).toContain('dev=0')
  })

  it('fails on a non-zero exit', async () => {
    const bin = writeFakeCli(3, 'boom')
    const report = await runSmoke(fakeContext(bin), { only: ['status'] })
    expect(report.runs[0].status).toBe('fail')
    expect(report.runs[0].reason).toContain('exit 3')
  })

  it('warns on warnOnExits codes', async () => {
    const bin = writeFakeCli(1, 'no results')
    // leaderboard declares warnOnExits: [1]
    const report = await runSmoke(fakeContext(bin), { only: ['leaderboard'] })
    expect(report.runs[0].status).toBe('warn')
  })

  it('skips on a license gate announcement', async () => {
    const bin = writeFakeCli(1, '⚡ Bundle budget analysis requires Pro tier.\nCurrent: free | Required: pro')
    const report = await runSmoke(fakeContext(bin), { only: ['bundle'] })
    expect(report.runs[0].status).toBe('skip')
    expect(report.runs[0].reason).toContain('Pro')
  })

  it('skips checks whose skipWhen fires', async () => {
    const bin = writeFakeCli(0, 'never called')
    const report = await runSmoke(fakeContext(bin), { only: ['profile'] })
    expect(report.runs[0].status).toBe('skip')
    expect(report.runs[0].output).toBe('')
  })

  it('honors okExits (doctor exits 1 when issues found)', async () => {
    const bin = writeFakeCli(1, '✖ 26 check(s) missing')
    const report = await runSmoke(fakeContext(bin), { only: ['doctor'] })
    expect(report.runs[0].status).toBe('pass')
  })

  it('excludes slow checks unless --full', async () => {
    const bin = writeFakeCli(0, 'ok')
    const fast = await runSmoke(fakeContext(bin), {})
    expect(fast.runs.every(r => r.check.id !== 'bench')).toBe(true)
    const full = await runSmoke(fakeContext(bin), { full: true, only: ['bench'] })
    expect(full.runs.map(r => r.check.id)).toContain('bench')
  })

  it('honors --only and --skip', async () => {
    const bin = writeFakeCli(0, 'ok')
    const report = await runSmoke(fakeContext(bin), { only: ['version', 'help'], skip: ['help'] })
    expect(report.runs.map(r => r.check.id)).toEqual(['version'])
  })
})

describe('flavor + source detection', () => {
  it('detects expo vs rn-cli vs unknown', () => {
    const dir = join(tmpdir(), `vectalon-flavor-${Math.random().toString(36).slice(2)}`)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ dependencies: { expo: '53.0.0' } }))
    expect(detectFlavor(dir)).toBe('expo')
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ dependencies: { 'react-native': '0.76.0' } }))
    expect(detectFlavor(dir)).toBe('rn-cli')
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ dependencies: {} }))
    expect(detectFlavor(dir)).toBe('unknown')
  })

  it('finds App entry and src files', () => {
    const dir = join(tmpdir(), `vectalon-src-${Math.random().toString(36).slice(2)}`)
    mkdirSync(join(dir, 'src', 'screens'), { recursive: true })
    writeFileSync(join(dir, 'App.tsx'), 'x')
    writeFileSync(join(dir, 'src', 'screens', 'Home.tsx'), 'x')
    const files = detectSourceFiles(dir)
    expect(files[0]).toBe('App.tsx')
    expect(files).toContain('src/screens/Home.tsx')
    // The CLI entry resolves to a real script.
    expect(existsSync(cliEntry())).toBe(true)
  })
})

describe('smoke reporters', () => {
  const report = {
    version: '0.2.0',
    flavor: 'rn-cli' as const,
    generatedAt: '2026-08-13T00:00:00.000Z',
    durationMs: 1234,
    totals: totalsFor([fakeRun('pass'), fakeRun('warn'), fakeRun('skip'), fakeRun('fail'), fakeRun('timeout')]),
    runs: [fakeRun('pass'), fakeRun('warn'), fakeRun('skip'), fakeRun('fail'), fakeRun('timeout')],
  }

  it('renders JSON with full output', () => {
    const json = JSON.parse(renderJsonReport(report)) as typeof report
    expect(json.totals.pass).toBe(1)
    expect(json.runs[0].output).toBe('out')
  })

  it('renders a terminal summary with totals', () => {
    const s = renderTerminalSummary(report)
    expect(s).toContain('1 passed')
    expect(s).toContain('1 warned')
    expect(s).toContain('1 skipped')
    expect(s).toContain('2 failed')
  })

  it('renders the activity log with command + output', () => {
    const log = renderActivityLog(report)
    expect(log).toContain('command: vectalon x')
    expect(log).toContain('--- output ---')
  })

  it('renders an HTML dashboard containing every run', () => {
    const html = renderHtmlReport(report)
    expect(html).toContain('<!doctype html>')
    for (const r of report.runs) {
      expect(html).toContain(r.check.name)
    }
  })
})
