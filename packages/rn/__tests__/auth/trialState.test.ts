import { existsSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { rmSync } from 'fs'
import { FileTrialStateStore } from '../../src/auth/trialState'

describe('secure trial state storage', () => {
  test('writes atomically with owner-only permissions and clears the credential', () => {
    const root = mkdtempSync(join(tmpdir(), 'vectalon-trial-'))
    const file = join(root, 'nested', 'trial.json')
    try {
      const store = new FileTrialStateStore(file)
      const state = { token: 'signed.credential.value', lastTrustedTime: 1_900_000_000_000, lastOnlineAt: 1_900_000_000_000 }
      store.write(state)
      expect(store.read()).toEqual(state)
      expect(statSync(file).mode & 0o777).toBe(0o600)
      expect(readFileSync(file, 'utf8')).not.toContain('github')
      expect(existsSync(`${file}.${process.pid}.tmp`)).toBe(false)
      store.clear()
      expect(existsSync(file)).toBe(false)
    } finally { rmSync(root, { recursive: true, force: true }) }
  })

  test('fails closed for unsigned legacy and malformed state', () => {
    const root = mkdtempSync(join(tmpdir(), 'vectalon-trial-'))
    const file = join(root, 'trial.json')
    try {
      const store = new FileTrialStateStore(file)
      writeFileSync(file, JSON.stringify({ githubUsername: 'forged', expiresAt: 9_999_999_999_999 }))
      expect(store.read()).toBeNull()
    } finally { rmSync(root, { recursive: true, force: true }) }
  })
})
