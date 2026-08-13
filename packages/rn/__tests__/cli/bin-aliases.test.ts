/**
 * Package bin aliases — `vectalon`, `vc`, and `nvx` all resolve to the same
 * CLI entry, so clients can type a short name instead of `npx vectalon`.
 * Business Source License 1.1 (BSL-1.1)
 */
import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'

const pkgPath = resolve(__dirname, '../../package.json')
const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as { bin: Record<string, string> }

describe('CLI bin aliases', () => {
  it('ships vectalon plus the vc shortcut', () => {
    expect(Object.keys(pkg.bin)).toEqual(expect.arrayContaining(['vectalon', 'vc', 'rn-vectalon']))
  })

  it('points every alias at the same existing entry script', () => {
    const entries = new Set(Object.values(pkg.bin))
    expect(entries.size).toBe(1)
    const entry = resolve(__dirname, '../../', Object.values(pkg.bin)[0])
    expect(existsSync(entry)).toBe(true)
    for (const bin of Object.values(pkg.bin)) {
      expect(resolve(__dirname, '../../', bin)).toBe(entry)
    }
  })
})
