import { NAV } from '../lib/nav'

describe('website header navigation', () => {
  it('keeps changelog out of both desktop and mobile shared navigation', () => {
    expect(NAV.some(item => item.href === '/changelog')).toBe(false)
    expect(NAV.some(item => item.href === '/docs')).toBe(true)
    expect(NAV.some(item => item.href === '/pricing')).toBe(true)
  })
})
