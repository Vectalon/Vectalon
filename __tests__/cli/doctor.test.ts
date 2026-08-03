import { mkdirSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { doctorCommand } from '../../src/cli/commands/doctor'
import { createTempProject, cleanup } from '../helpers/tmp'
import type { DoctorCheckers, DoctorFixer } from '../../src/ecosystem'

function okFixer(): DoctorFixer {
  return { run: () => ({ success: true, output: 'ok' }) }
}

/** All-green stubbed checkers: no real subprocesses, no network, no exit. */
function okCheckers(): DoctorCheckers {
  return {
    packageInstalled: () => true,
    run: () => ({ success: true, output: 'v20.11.0' }),
    dirExists: () => false,
    env: () => undefined,
    portOpen: () => false,
    platform: 'linux',
    hasModel: () => true,
    writable: () => true,
  }
}

describe('doctorCommand', () => {
  let dir: string

  beforeEach(() => {
    dir = createTempProject({
      'package.json': JSON.stringify({
        name: 'app',
        version: '1.0.0',
        dependencies: { 'react-native': '0.76.0', zustand: '5.0.0' },
      }),
    })
    jest.spyOn(process.stderr, 'write').mockImplementation(() => true)
    jest.spyOn(process.stdout, 'write').mockImplementation(() => true)
  })

  afterEach(() => {
    cleanup(dir)
  })

  it('runs the native toolchain even when the project has no ecosystem config', () => {
    const exit = jest.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('exit')
    })

    // No .vectalon/ecosystem.json: doctor still runs toolchain checks and only
    // exits non-zero if a toolchain check fails. With all-green stubs, it runs
    // to completion without exiting.
    expect(() => doctorCommand(dir, { checkers: okCheckers() })).not.toThrow()
    expect(exit).not.toHaveBeenCalled()
  })

  it('runs and prints OK for a project with no enabled items', () => {
    mkdirSync(join(dir, '.vectalon'), { recursive: true })
    writeFileSync(join(dir, '.vectalon', 'ecosystem.json'), JSON.stringify({ version: '1.0.0', enabled: [] }))

    // No enabled items -> no exit, just a warning.
    expect(() => doctorCommand(dir, { checkers: okCheckers() })).not.toThrow()
  })

  it('prints a native toolchain section in the human-readable output', () => {
    mkdirSync(join(dir, '.vectalon'), { recursive: true })
    writeFileSync(join(dir, '.vectalon', 'ecosystem.json'), JSON.stringify({ version: '1.0.0', enabled: [] }))

    // logger.info writes headers to stderr; tables go to stdout.
    let out = ''
    jest.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => {
      if (typeof chunk === 'string') out += chunk
      return true
    })
    jest.spyOn(process.stderr, 'write').mockImplementation((chunk: string | Uint8Array) => {
      if (typeof chunk === 'string') out += chunk
      return true
    })

    expect(() => doctorCommand(dir, { checkers: okCheckers() })).not.toThrow()
    expect(out).toContain('Native toolchain')
    expect(out).toContain('Node.js')
  })

  it('prints a nightly leaderboard readiness section', () => {
    mkdirSync(join(dir, '.vectalon'), { recursive: true })
    writeFileSync(join(dir, '.vectalon', 'ecosystem.json'), JSON.stringify({ version: '1.0.0', enabled: [] }))

    let out = ''
    jest.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => {
      if (typeof chunk === 'string') out += chunk
      return true
    })
    jest.spyOn(process.stderr, 'write').mockImplementation((chunk: string | Uint8Array) => {
      if (typeof chunk === 'string') out += chunk
      return true
    })

    expect(() => doctorCommand(dir, { checkers: okCheckers() })).not.toThrow()
    expect(out).toContain('Nightly leaderboard readiness')
    expect(out).toContain('OPENAI_API_KEY secret')
    expect(out).toContain('Local model downloaded')
    expect(out).toContain('Benchmark results directory')
  })

  it('includes leaderboard checks in the --json report and honors a custom model id', () => {
    mkdirSync(join(dir, '.vectalon'), { recursive: true })
    writeFileSync(join(dir, '.vectalon', 'ecosystem.json'), JSON.stringify({ version: '1.0.0', enabled: [] }))

    let jsonOutput = ''
    jest.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => {
      if (typeof chunk === 'string') jsonOutput += chunk
      return true
    })
    const exit = jest.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('exit')
    }) as unknown as (code?: string | number | null) => never)

    try {
      doctorCommand(dir, {
        json: true,
        checkers: {
          ...okCheckers(),
          env: name => (name === 'OPENAI_API_KEY' || name === 'ANTHROPIC_API_KEY' ? 'sk-' : undefined),
        },
        leaderboard: { localModelPresetId: 'qwen2.5-coder-3b' },
      })
    } catch {
      // no-op: exit mocked to throw
    }
    const parsed = JSON.parse(jsonOutput) as { leaderboard: Array<{ id: string; status: string }> }
    expect(parsed.leaderboard.map(c => c.id)).toEqual(['lb-openai-key', 'lb-anthropic-key', 'lb-local-model', 'lb-results-dir'])
    expect(parsed.leaderboard.every(c => c.status === 'ok')).toBe(true)
    expect(exit).toHaveBeenCalledWith(0)
  })

  it('prints a JSON report with --json including the toolchain section', () => {
    mkdirSync(join(dir, '.vectalon'), { recursive: true })
    writeFileSync(
      join(dir, '.vectalon', 'ecosystem.json'),
      JSON.stringify({ version: '1.0.0', enabled: ['zustand'] })
    )

    let jsonOutput = ''
    const stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => {
      if (typeof chunk === 'string') jsonOutput += chunk
      return true
    })
    const exit = jest.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('exit')
    }) as unknown as (code?: string | number | null) => never)

    // zustand resolves (packageInstalled: true), so nothing is missing -> exit 0.
    try {
      doctorCommand(dir, { json: true, checkers: okCheckers() })
    } catch {
      // no-op: exit mocked to throw
    }
    expect(stdoutSpy).toHaveBeenCalled()
    expect(jsonOutput).toContain('"checks"')
    expect(jsonOutput).toContain('"toolchain"')
    expect(exit).toHaveBeenCalledWith(0)
    expect(existsSync(join(dir, '.vectalon', 'ecosystem.json'))).toBe(true)
  })

  it('exits 1 when an ecosystem item is missing', () => {
    mkdirSync(join(dir, '.vectalon'), { recursive: true })
    writeFileSync(
      join(dir, '.vectalon', 'ecosystem.json'),
      JSON.stringify({ version: '1.0.0', enabled: ['zustand'] })
    )
    const exit = jest.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('exit')
    }) as unknown as (code?: string | number | null) => never)

    // packageInstalled returns false -> zustand missing -> exit 1.
    try {
      doctorCommand(dir, {
        json: true,
        checkers: { ...okCheckers(), packageInstalled: () => false },
      })
    } catch {
      // expected
    }
    expect(exit).toHaveBeenCalledWith(1)
  })

  it('honors a custom Metro port via the toolchain option', () => {
    mkdirSync(join(dir, '.vectalon'), { recursive: true })
    writeFileSync(join(dir, '.vectalon', 'ecosystem.json'), JSON.stringify({ version: '1.0.0', enabled: [] }))

    let out = ''
    jest.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => {
      if (typeof chunk === 'string') out += chunk
      return true
    })

    const checkers = okCheckers()
    checkers.portOpen = p => p === 8088
    expect(() => doctorCommand(dir, { checkers, toolchain: { metroPort: 8088 } })).not.toThrow()
    // The wider 26-char Check column fits the full "Metro (port 8088)" name.
    expect(out).toContain('Metro (port 8088)')
  })

  it('--fix runs install commands for missing items and re-checks', () => {
    mkdirSync(join(dir, '.vectalon'), { recursive: true })
    writeFileSync(
      join(dir, '.vectalon', 'ecosystem.json'),
      JSON.stringify({ version: '1.0.0', enabled: ['zustand'] })
    )

    // logger.info writes the "Attempting to fix…" banner to stderr; tables go to
    // stdout.
    let out = ''
    jest.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => {
      if (typeof chunk === 'string') out += chunk
      return true
    })
    jest.spyOn(process.stderr, 'write').mockImplementation((chunk: string | Uint8Array) => {
      if (typeof chunk === 'string') out += chunk
      return true
    })
    const exit = jest.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('exit')
    }) as unknown as (code?: string | number | null) => never)

    // zustand missing (packageInstalled: false) → the fixer runs `npm install zustand`.
    const calls: Array<{ command: string; args: string[] }> = []
    const fixer = okFixer()
    fixer.run = (command, args) => {
      calls.push({ command, args })
      return { success: true, output: 'ok' }
    }

    try {
      doctorCommand(dir, {
        fix: true,
        checkers: { ...okCheckers(), packageInstalled: () => false },
        fixer,
      })
    } catch {
      // exit mocked to throw
    }

    expect(calls.some(c => c.command === 'npm' && c.args.includes('zustand'))).toBe(true)
    expect(out).toContain('Attempting to fix missing checks')
    expect(exit).toHaveBeenCalled()
  })

  it('--fix with everything OK runs nothing and exits 0', () => {
    mkdirSync(join(dir, '.vectalon'), { recursive: true })
    writeFileSync(
      join(dir, '.vectalon', 'ecosystem.json'),
      JSON.stringify({ version: '1.0.0', enabled: ['zustand'] })
    )
    const exit = jest.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('exit')
    }) as unknown as (code?: string | number | null) => never)
    const fixer = okFixer()
    const spy = jest.spyOn(fixer, 'run')

    try {
      doctorCommand(dir, { fix: true, json: true, checkers: okCheckers(), fixer })
    } catch {
      // exit mocked to throw (should be 0)
    }
    expect(spy).not.toHaveBeenCalled()
    expect(exit).toHaveBeenCalledWith(0)
  })
})
