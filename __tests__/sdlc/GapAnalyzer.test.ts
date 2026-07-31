import { GapAnalyzer } from '../../src/sdlc/GapAnalyzer'

describe('GapAnalyzer', () => {
  it('flags desired capabilities that are missing and counts met ones', () => {
    const gap = new GapAnalyzer().analyze({ desired: ['push notifications', 'sync'], current: ['sync'] })
    expect(gap.missing).toEqual(['push notifications'])
    expect(gap.met).toEqual(['sync'])
    expect(gap.partial).toEqual([])
  })

  it('marks substring matches as partial', () => {
    const gap = new GapAnalyzer().analyze({ desired: ['offline sync'], current: ['sync'] })
    expect(gap.missing).toEqual([])
    expect(gap.partial).toEqual(['offline sync'])
  })

  it('ignores case differences', () => {
    const gap = new GapAnalyzer().analyze({ desired: ['CAMERA'], current: ['camera'] })
    expect(gap.met).toEqual(['CAMERA'])
  })

  it('derives a recommendation for each missing capability', () => {
    const gap = new GapAnalyzer().analyze({ desired: ['a', 'b'], current: [] })
    expect(gap.recommendations).toContain('Implement a')
    expect(gap.recommendations).toContain('Implement b')
  })

  it('renders a readable report', () => {
    const report = new GapAnalyzer().render({ missing: ['x'], partial: [], met: [], recommendations: ['Implement x'] })
    expect(report).toContain('Gap Analysis')
    expect(report).toContain('Missing')
    expect(report).toContain('Implement x')
  })
})
