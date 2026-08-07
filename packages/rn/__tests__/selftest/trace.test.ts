import { existsSync, readFileSync } from 'fs'
import { ActivityTracer, Sandbox, createTracedRunner } from '../../src/selftest/trace'

describe('ActivityTracer', () => {
  it('records steps, commands, writes, artifacts, and warns', () => {
    const trace = new ActivityTracer()
    trace.step('scanning project')
    trace.command('git', ['log'], '/tmp')
    trace.write('.vectalon/config.json', 42)
    trace.artifact('docs/plan.md', 'release plan')
    trace.warn('optional dependency missing')

    expect(trace.steps).toHaveLength(5)
    expect(trace.steps[0]).toMatchObject({ kind: 'step', message: 'scanning project' })
    expect(trace.steps[1]).toMatchObject({ kind: 'command', command: { command: 'git', args: ['log'], cwd: '/tmp' } })
    expect(trace.steps[2]).toMatchObject({ kind: 'write', write: { path: '.vectalon/config.json', bytes: 42 } })
    expect(trace.steps[3]).toMatchObject({ kind: 'artifact', artifact: { path: 'docs/plan.md' } })
    expect(trace.steps[4].kind).toBe('warn')

    const counts = trace.counts()
    expect(counts).toEqual({ steps: 5, commands: 1, writes: 1, artifacts: 1 })
  })

  it('formats a readable activity log', () => {
    const trace = new ActivityTracer()
    trace.command('node', ['--version'], '/tmp')
    trace.write('a.json', 3)
    expect(trace.format()).toContain('$ node --version')
    expect(trace.format()).toContain('✎ a.json (3 B)')
  })
})

describe('Sandbox', () => {
  it('writes traced files inside the sandbox and cleans up', () => {
    const trace = new ActivityTracer()
    const sandbox = new Sandbox(trace)
    const path = sandbox.file('src/App.tsx', 'const App = () => null;')
    expect(existsSync(path)).toBe(true)
    expect(readFileSync(path, 'utf-8')).toBe('const App = () => null;')
    expect(trace.steps.some(s => s.kind === 'write' && s.write?.path === 'src/App.tsx')).toBe(true)

    sandbox.json('.vectalon/config.json', { version: '1' })
    expect(sandbox.exists('.vectalon/config.json')).toBe(true)
    expect(sandbox.dir('packages/ui')).toBeTruthy()

    sandbox.cleanup()
    expect(existsSync(sandbox.root)).toBe(false)
  })
})

describe('createTracedRunner', () => {
  it('traces the command and appends its exit code + outcome', async () => {
    const trace = new ActivityTracer()
    const runner = jest.fn(async () => ({ success: true, stdout: 'v20.0.0\n', stderr: '', exitCode: 0 }))
    const traced = createTracedRunner(trace, '/tmp', runner)

    const result = await traced('node', ['--version'])
    expect(result.success).toBe(true)
    expect(trace.steps[0]).toMatchObject({ kind: 'command', command: { command: 'node', exitCode: 0 } })
    expect(trace.steps[1].message).toContain('exit 0')

    const failing = createTracedRunner(trace, '/tmp', jest.fn(async () => ({ success: false, stdout: '', stderr: 'boom', exitCode: 1 })))
    await failing('nope', [])
    const last = trace.steps[trace.steps.length - 1]
    expect(last.kind).toBe('warn')
    expect(last.message).toContain('boom')
  })

  it('defaults the cwd to the runner default', async () => {
    const trace = new ActivityTracer()
    const runner = jest.fn(async () => ({ success: true, stdout: '', stderr: '', exitCode: 0 }))
    const traced = createTracedRunner(trace, '/work', runner)
    await traced('ls', [])
    expect(runner).toHaveBeenCalledWith('ls', [], { cwd: '/work', timeout: 30000 })
  })
})
