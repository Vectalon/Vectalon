import { SWOTAnalyzer } from '../../src/sdlc/SWOTAnalyzer'

const input = {
  strengths: ['fast app'],
  weaknesses: ['small team'],
  opportunities: ['AI market'],
  threats: ['competitors'],
}

describe('SWOTAnalyzer', () => {
  it('keeps the four quadrants intact', () => {
    const swot = new SWOTAnalyzer().analyze(input)
    expect(swot.strengths).toEqual(['fast app'])
    expect(swot.weaknesses).toEqual(['small team'])
    expect(swot.opportunities).toEqual(['AI market'])
    expect(swot.threats).toEqual(['competitors'])
  })

  it('derives at least one strategy per combination', () => {
    const swot = new SWOTAnalyzer().analyze(input)
    expect(swot.strategies.so.length).toBeGreaterThan(0)
    expect(swot.strategies.wo.length).toBeGreaterThan(0)
    expect(swot.strategies.st.length).toBeGreaterThan(0)
    expect(swot.strategies.wt.length).toBeGreaterThan(0)
    expect(swot.strategies.so[0]).toContain('fast app')
  })

  it('renders a four-quadrant report', () => {
    const report = new SWOTAnalyzer().render(new SWOTAnalyzer().analyze(input))
    expect(report).toContain('Strengths')
    expect(report).toContain('Weaknesses')
    expect(report).toContain('Opportunities')
    expect(report).toContain('Threats')
  })
})
