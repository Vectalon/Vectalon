import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { dirname, join } from 'path'
import { createTempProject, cleanup } from '../helpers/tmp'
import {
  loadFailedHeals,
  recordFailedHeals,
  formatFailedHeals,
  failedHealsPath,
} from '../../src/workflows/phases/healMemory'

describe('healMemory', () => {
  let dir: string

  beforeEach(() => {
    dir = createTempProject({})
  })

  afterEach(() => {
    cleanup(dir)
  })

  it('returns [] when no failed-heals file exists', () => {
    expect(loadFailedHeals(dir)).toEqual([])
  })

  it('records and reloads failed heals newest-first', () => {
    recordFailedHeals(dir, [
      {
        timestamp: 1,
        prompt: 'Login screen',
        file: 'src/services/LoginApi.ts',
        findings: [{ severity: 'error', rule: 'no-any', message: 'Avoid any', line: 3 }],
      },
    ])
    recordFailedHeals(dir, [
      {
        timestamp: 2,
        prompt: 'Profile screen',
        file: 'src/screens/Profile.tsx',
        findings: [{ severity: 'warning', rule: 'inline-style', message: 'Use StyleSheet', line: 7 }],
      },
    ])

    const records = loadFailedHeals(dir)
    expect(records).toHaveLength(2)
    // Newest first.
    expect(records[0].file).toBe('src/screens/Profile.tsx')
    expect(records[1].file).toBe('src/services/LoginApi.ts')
    expect(existsSync(failedHealsPath(dir))).toBe(true)
  })

  it('formats records compactly for prompt injection', () => {
    const out = formatFailedHeals([
      {
        timestamp: 1,
        prompt: 'Login screen',
        file: 'src/services/LoginApi.ts',
        findings: [{ severity: 'error', rule: 'no-any', message: 'Avoid any', line: 3 }],
      },
    ])
    expect(out).toContain('src/services/LoginApi.ts')
    expect(out).toContain('[error] no-any (line 3): Avoid any')
  })

  it('tolerates a corrupted file', () => {
    // Ensure the knowledge dir exists (recordFailedHeals creates it lazily).
    mkdirSync(dirname(failedHealsPath(dir)), { recursive: true })
    writeFileSync(failedHealsPath(dir), 'not json{{{')
    expect(loadFailedHeals(dir)).toEqual([])
    // Recording still works after corruption.
    recordFailedHeals(dir, [
      {
        timestamp: 3,
        prompt: 'x',
        file: 'a.ts',
        findings: [{ severity: 'error', rule: 'r', message: 'm', line: 1 }],
      },
    ])
    expect(loadFailedHeals(dir)).toHaveLength(1)
  })

  it('persists to .vectalon/knowledge/failed-heals.json', () => {
    expect(failedHealsPath(dir)).toBe(join(dir, '.vectalon', 'knowledge', 'failed-heals.json'))
    recordFailedHeals(dir, [
      {
        timestamp: 4,
        prompt: 'x',
        file: 'b.ts',
        findings: [{ severity: 'error', rule: 'r', message: 'm', line: 1 }],
      },
    ])
    const raw = JSON.parse(readFileSync(failedHealsPath(dir), 'utf-8'))
    expect(Array.isArray(raw)).toBe(true)
  })
})
