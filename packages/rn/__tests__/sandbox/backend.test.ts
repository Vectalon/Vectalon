import { detectBackend, resetBackendCache, buildMacProfile, buildBwrapArgs } from '../../src/sandbox/backend'

describe('detectBackend', () => {
  beforeEach(() => resetBackendCache())
  afterEach(() => resetBackendCache())

  it('returns a known isolation level with boolean capability flags', () => {
    const backend = detectBackend()
    expect(['sandbox-exec', 'bwrap', 'process']).toContain(backend.isolation)
    expect(typeof backend.canDenyNetwork).toBe('boolean')
    expect(typeof backend.canConfineWrites).toBe('boolean')
    // Process fallback must be honest about what it cannot enforce.
    if (backend.isolation === 'process') {
      expect(backend.canDenyNetwork).toBe(false)
      expect(backend.canConfineWrites).toBe(false)
    }
  })

  it('caches the detection result', () => {
    const a = detectBackend()
    const b = detectBackend()
    expect(a).toBe(b)
  })
})

describe('buildMacProfile', () => {
  it('denies network by default and confines writes to the root', () => {
    const profile = buildMacProfile('/tmp/sandbox', false)
    expect(profile).toContain('(version 1)')
    expect(profile).toContain('(deny default)')
    expect(profile).toContain('(deny network*)')
    expect(profile).toContain('(allow file-write* (subpath "/tmp/sandbox")')
    expect(profile).not.toContain('(allow network*)')
  })

  it('allows network when requested', () => {
    const profile = buildMacProfile('/tmp/sandbox', true)
    expect(profile).toContain('(allow network*)')
    expect(profile).not.toContain('(deny network*)')
  })

  it('escapes quotes in the root path', () => {
    const profile = buildMacProfile('/tmp/weird"root', false)
    expect(profile).toContain('"/tmp/weird\\"root"')
  })
})

describe('buildBwrapArgs', () => {
  it('unshares the network namespace by default and binds the root rw', () => {
    const args = buildBwrapArgs('/tmp/sandbox', false)
    expect(args).toContain('--unshare-net')
    expect(args).toContain('--ro-bind')
    expect(args).toContain('--bind')
    expect(args).toContain('/tmp/sandbox')
  })

  it('skips the network namespace when network is allowed', () => {
    const args = buildBwrapArgs('/tmp/sandbox', true)
    expect(args).not.toContain('--unshare-net')
  })
})
