import { TradeoffAnalyzer } from '../../src/sdlc/TradeoffAnalyzer'

const OPTIONS = [
  { name: 'Option A', scores: { cost: 1, speed: 2, reliability: 3 } },
  { name: 'Option B', scores: { cost: 3, speed: 4, reliability: 1 } },
]

describe('TradeoffAnalyzer', () => {
  it('ranks options by total score descending', () => {
    const result = new TradeoffAnalyzer().analyze(OPTIONS)
    expect(result.ranking[0].name).toBe('Option B')
    expect(result.ranking[1].name).toBe('Option A')
    expect(result.ranking[0].total).toBe(8)
  })

  it('identifies the best option', () => {
    const result = new TradeoffAnalyzer().analyze(OPTIONS)
    expect(result.best).toBe('Option B')
  })

  it('returns an empty ranking for no options', () => {
    const result = new TradeoffAnalyzer().analyze([])
    expect(result.ranking).toEqual([])
    expect(result.best).toBeNull()
  })

  it('renders a readable comparison', () => {
    const result = new TradeoffAnalyzer().analyze(OPTIONS)
    const report = new TradeoffAnalyzer().render(result)
    expect(report).toContain('Tradeoff Analysis')
    expect(report).toContain('Option A')
    expect(report).toContain('Best option: Option B')
  })
})
