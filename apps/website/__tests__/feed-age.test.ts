import { formatAge } from '../components/FeedAge'

const NOW = 1_700_000_000_000

describe('formatAge', () => {
  it('renders "just now" for anything under a minute', () => {
    expect(formatAge(NOW, NOW)).toBe('just now')
    expect(formatAge(NOW - 59_000, NOW)).toBe('just now')
  })

  it('renders minutes as "Nm ago"', () => {
    expect(formatAge(NOW - 60_000, NOW)).toBe('1m ago')
    expect(formatAge(NOW - 12 * 60_000, NOW)).toBe('12m ago')
    expect(formatAge(NOW - 59 * 60_000, NOW)).toBe('59m ago')
  })

  it('renders hours as "Nh ago"', () => {
    expect(formatAge(NOW - 60 * 60_000, NOW)).toBe('1h ago')
    expect(formatAge(NOW - 12 * 60 * 60_000, NOW)).toBe('12h ago')
    expect(formatAge(NOW - 23 * 60 * 60_000, NOW)).toBe('23h ago')
  })

  it('renders days for anything older', () => {
    expect(formatAge(NOW - 24 * 60 * 60_000, NOW)).toBe('1d ago')
    expect(formatAge(NOW - 3 * 24 * 60 * 60_000, NOW)).toBe('3d ago')
  })

  it('never shows a negative age (clock skew safe)', () => {
    expect(formatAge(NOW + 5_000, NOW)).toBe('just now')
  })
})
