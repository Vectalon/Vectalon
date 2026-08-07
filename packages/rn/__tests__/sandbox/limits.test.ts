import { buildLimitWrapper, buildShellArgs } from '../../src/sandbox/limits'

describe('buildLimitWrapper', () => {
  it('emits a plain exec when no limits are requested', () => {
    const script = buildLimitWrapper({ root: '/tmp/x' })
    expect(script).toContain('exec "$0" "$@"')
    expect(script).not.toContain('ulimit -t')
  })

  it('applies cpu/memory/file-size limits when requested', () => {
    const script = buildLimitWrapper({ root: '/tmp/x', cpuSeconds: 5, memoryMb: 256, fileSizeMb: 10 })
    expect(script).toContain('ulimit -t 5')
    expect(script).toContain('ulimit -v 262144') // 256 MB in KB
    expect(script).toContain('ulimit -f 10240') // 10 MB in KB
  })

  it('defaults open-files and processes caps', () => {
    const script = buildLimitWrapper({ root: '/tmp/x' })
    expect(script).toContain('ulimit -n 128')
    expect(script).toContain('ulimit -u 64')
  })

  it('never interpolates the command into the script (no injection surface)', () => {
    const script = buildLimitWrapper({ root: '/tmp/x', cpuSeconds: 1 })
    const args = buildShellArgs('node', ['-e', 'console.log(1); rm -rf /'], script)
    expect(args[0]).toBe('-c')
    expect(args[2]).toBe('node')
    expect(script).not.toContain('rm -rf')
  })
})
