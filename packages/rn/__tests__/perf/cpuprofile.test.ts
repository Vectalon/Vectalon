import { parseCpuProfile, analyzeCpuProfile, findBlockingEvents, hotFunctions, normalizeScriptUrl } from '../../src/perf/cpuprofile'
import { cpuProfileFixture } from './fixtures'

describe('parseCpuProfile', () => {
  it('parses the flat nodes/samples/timeDeltas layout', () => {
    const profile = parseCpuProfile(cpuProfileFixture(200))
    expect(profile).not.toBeNull()
    expect(profile?.nodes.size).toBe(3)
    expect(profile?.samples.length).toBeGreaterThan(0)
    expect(profile?.timeDeltas.length).toBe(profile?.samples.length)
  })

  it('returns null for garbage input (never throws)', () => {
    expect(parseCpuProfile(null)).toBeNull()
    expect(parseCpuProfile('nope')).toBeNull()
    expect(parseCpuProfile({})).toBeNull()
  })

  it('falls back to hitCount ratios for the head-tree layout', () => {
    const profile = parseCpuProfile({
      startTime: 0,
      endTime: 1000000,
      nodes: [
        { id: 1, callFrame: { functionName: '(root)', url: '', lineNumber: 0 }, hitCount: 10, children: [2] },
        { id: 2, callFrame: { functionName: 'loop', url: 'file:///App.tsx', lineNumber: 5 }, hitCount: 90, children: [] },
      ],
    })
    expect(profile).not.toBeNull()
    const hot = hotFunctions(profile!, 10)
    expect(hot[0].functionName).toBe('loop')
    expect(hot[0].selfTimeMs).toBeCloseTo(900, 0)
  })
})

describe('normalizeScriptUrl', () => {
  it('strips file:// and keeps the path', () => {
    expect(normalizeScriptUrl('file:///Users/me/App.tsx')).toBe('/Users/me/App.tsx')
  })
  it('keeps http paths readable', () => {
    expect(normalizeScriptUrl('http://localhost:8081/index.bundle?platform=ios')).toContain('index.bundle')
  })
  it('returns null for empty urls', () => {
    expect(normalizeScriptUrl('')).toBeNull()
    expect(normalizeScriptUrl(undefined)).toBeNull()
  })
})

describe('findBlockingEvents', () => {
  it('flags a 500ms contiguous run in useEffect', () => {
    const profile = parseCpuProfile(cpuProfileFixture(500))!
    const events = findBlockingEvents(profile, 100)
    expect(events.length).toBe(1)
    expect(events[0].functionName).toBe('useEffect')
    expect(events[0].durationMs).toBeGreaterThanOrEqual(500)
    expect(events[0].file).toContain('App.tsx')
  })

  it('ignores runs under the threshold', () => {
    // The fixture clamps to at least 2 samples (100ms); a 150ms threshold
    // must ignore that run entirely.
    const profile = parseCpuProfile(cpuProfileFixture(60))!
    expect(findBlockingEvents(profile, 150)).toHaveLength(0)
  })
})

describe('analyzeCpuProfile', () => {
  it('reports totals, hot functions, and blocking events', () => {
    const stats = analyzeCpuProfile(cpuProfileFixture(500), 100, 10)!
    expect(stats).not.toBeNull()
    expect(stats.totalSamples).toBeGreaterThan(0)
    expect(stats.hotFunctions[0].functionName).toBe('useEffect')
    expect(stats.blockingEvents.length).toBe(1)
    expect(stats.totalBlockingMs).toBeGreaterThanOrEqual(500)
  })

  it('returns null for unusable input', () => {
    expect(analyzeCpuProfile(null)).toBeNull()
  })
})
