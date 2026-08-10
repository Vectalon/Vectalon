import {
  rnMinorOf,
  rnIsAheadOfRuleSet,
  rnDriftWarning,
  warnIfRnVersionAhead,
} from '../../src/upgrade/drift'
import { LATEST_KNOWN_RN } from '../../src/upgrade/catalog'

describe('RN version drift warning (P1-14)', () => {
  it('parses the minor of a semver RN version', () => {
    expect(rnMinorOf('0.72.5')).toBe(72)
    expect(rnMinorOf('0.81.0')).toBe(81)
    expect(rnMinorOf('not a version')).toBeNull()
    expect(rnMinorOf('')).toBeNull()
  })

  it('flags only versions newer than the newest known minor', () => {
    const latest = Number(LATEST_KNOWN_RN.split('.')[1])
    expect(rnIsAheadOfRuleSet(`0.${latest}.0`)).toBe(false)
    expect(rnIsAheadOfRuleSet(`0.${latest + 1}.0`)).toBe(true)
    expect(rnIsAheadOfRuleSet('0.72.5')).toBe(false)
    expect(rnIsAheadOfRuleSet(`0.${latest + 2}.0`)).toBe(true)
    expect(rnIsAheadOfRuleSet('garbage')).toBe(false)
  })

  it('renders the loud warning text with both versions', () => {
    const text = rnDriftWarning('0.99.0')
    expect(text).toContain('React Native 0.99.0')
    expect(text).toContain(LATEST_KNOWN_RN)
    expect(text).toContain('may be inaccurate')
  })

  it('emits the warning only when ahead of the rule set', () => {
    expect(warnIfRnVersionAhead('0.72.5')).toBe(false)
    expect(warnIfRnVersionAhead(`0.${Number(LATEST_KNOWN_RN.split('.')[1])}.0`)).toBe(false)
    expect(warnIfRnVersionAhead('0.99.0')).toBe(true)
  })
})
