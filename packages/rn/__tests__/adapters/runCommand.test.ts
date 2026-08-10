import { setCommandListener, runCommand } from '../../src/adapters/runCommand'

describe('runCommand command listener', () => {
  afterEach(() => {
    setCommandListener(null)
  })

  it('emits a start event then exactly one completion event', async () => {
    const events: string[] = []
    setCommandListener(e => {
      events.push(e.result ? 'done' : 'start')
    })

    const result = await runCommand('node', ['-e', 'console.log("hi")'], { cwd: process.cwd() })
    expect(result.success).toBe(true)

    expect(events).toEqual(['start', 'done'])
  })

  it('emits a single completion event when the command cannot be spawned', async () => {
    // Node fires both 'error' and 'close' on spawn failure — the listener must
    // collapse them into one completion event (a duplicate would double-count
    // in the workflow summary's "Commands run" section).
    const events: string[] = []
    setCommandListener(e => {
      if (e.result) events.push(`done:${e.result.exitCode}`)
      else events.push('start')
    })

    const result = await runCommand('vectalon-command-that-does-not-exist-xyz', [], { cwd: process.cwd() })
    expect(result.success).toBe(false)
    expect(result.exitCode).toBe(1)

    expect(events).toEqual(['start', 'done:1'])
  })

  it('carries duration and command line on the completion event', async () => {
    let captured: { command: string; durationMs?: number; result?: { exitCode: number } } | null = null
    setCommandListener(e => {
      if (e.result) captured = { command: e.command, durationMs: e.durationMs, result: e.result }
    })

    await runCommand('node', ['-e', 'console.log("x")'], { cwd: process.cwd() })

    expect(captured).not.toBeNull()
    expect(captured!.command).toBe('node -e console.log("x")')
    expect(captured!.durationMs).toBeGreaterThanOrEqual(0)
    expect(captured!.result!.exitCode).toBe(0)
  })

  it('emits nothing when no listener is attached', async () => {
    setCommandListener(null)
    const result = await runCommand('node', ['-e', 'console.log("x")'], { cwd: process.cwd() })
    expect(result.success).toBe(true)
  })
})
