import { renderTrendChart, shortDate, axisDate, trendWindow } from '../../src/score/trend'
import type { ScoreTrendPoint } from '../../src/score/trend'

function pts(values: number[], dates?: string[]): ScoreTrendPoint[] {
  return values.map((overall, i) => ({
    scoredAt: dates?.[i] ?? new Date(Date.UTC(2026, 6, 14 + i)).toISOString(),
    overall,
  }))
}

describe('vc score — trend chart', () => {
  it('renders a polyline with the peak, valley, and newest-point marker', () => {
    const lines = renderTrendChart(pts([80, 85, 90, 82, 86]))
    const chart = lines.join('\n')
    // Y axis labels present.
    expect(lines[0]).toMatch(/100┤/)
    // Peak (90) and valley (82) corners, newest point marked.
    expect(chart).toContain('╭')
    expect(chart).toContain('╰')
    expect(chart).toContain('●')
    // X axis line spans 2 columns per point.
    expect(chart).toContain('└' + '─'.repeat(10))
  })

  it('renders points at non-step values without losing the line', () => {
    const lines = renderTrendChart(pts([80, 86]))
    const chart = lines.join('\n')
    expect(chart).toContain('●')
    expect(chart).toContain('└' + '─'.repeat(4))
  })

  it('shows a centered date legend that keeps first and last dates', () => {
    const dates = ['2026-07-14T00:00:00Z', '2026-07-21T00:00:00Z', '2026-08-01T00:00:00Z']
    const lines = renderTrendChart(pts([80, 85, 90], dates))
    const axis = lines[lines.length - 1]
    expect(axis).toContain('7/14')
    expect(axis).toContain('8/1')
    expect(axis).toContain('·')
    expect(shortDate('2026-08-01T00:00:00Z')).toBe('Aug 1')
    expect(axisDate('2026-08-01T00:00:00Z')).toBe('8/1')
  })

  it('keeps a 12-run legend bounded to the endpoints and middles', () => {
    const dates = Array.from({ length: 12 }, (_, i) => new Date(Date.UTC(2026, 6, 14 + i)).toISOString())
    const lines = renderTrendChart(pts(Array.from({ length: 12 }, (_, i) => 70 + i), dates))
    const axis = lines[lines.length - 1]
    expect(axis).toContain('7/14')
    expect(axis).toContain('7/25') // last date 7/14+11 = 7/25
    // Five dates max, with separators — well under the carbon window width.
    expect(axis.trim().split(' · ').length).toBeLessThanOrEqual(5)
    expect(axis.trim().length).toBeLessThan(40)
  })

  it('windows the y axis to the data with headroom', () => {
    expect(trendWindow([82, 86])).toEqual({ min: 70, max: 100 })
    expect(trendWindow([100, 100])).toEqual({ min: 90, max: 100 })
    expect(trendWindow([0, 2])).toEqual({ min: 0, max: 10 })
    expect(trendWindow([])).toEqual({ min: 0, max: 100 })
  })

  it('returns empty for no points', () => {
    expect(renderTrendChart([])).toEqual([])
  })
})
