import { main } from '../index'

describe('cli-app', () => {
  it('greets', () => {
    expect(main(['greet', 'Ada'])).toBe(0)
  })

  it('prints the version', () => {
    expect(main(['version'])).toBe(0)
  })

  it('rejects unknown commands', () => {
    expect(main(['bogus'])).toBe(1)
  })
})
