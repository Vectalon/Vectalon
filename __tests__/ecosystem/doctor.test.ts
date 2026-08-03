import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { runEcosystemDoctor, checkEcosystemItem, type DoctorCheckers } from '../../src/ecosystem'
import { listEcosystemItems, getEcosystemItem } from '../../src/ecosystem'

function makeCheckers(overrides: Partial<DoctorCheckers> = {}): DoctorCheckers {
  return {
    packageInstalled: () => false,
    run: () => ({ success: false, output: '' }),
    dirExists: () => false,
    ...overrides,
  }
}

describe('ecosystem doctor', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'vectalon-doctor-'))
  })

  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('reports a locally installed tool as OK', () => {
    const item = getEcosystemItem('zustand')!
    const result = checkEcosystemItem(item, dir, makeCheckers({ packageInstalled: () => true }))
    expect(result.status).toBe('ok')
    expect(result.detail).toContain('installed locally')
  })

  it('reports a missing npm tool with an install hint', () => {
    const item = getEcosystemItem('zustand')!
    const result = checkEcosystemItem(item, dir, makeCheckers())
    expect(result.status).toBe('missing')
    expect(result.hint).toContain('npm install')
  })

  it('reports an npx MCP as OK when its package resolves or the binary responds', () => {
    const item = getEcosystemItem('metro-mcp')!
    // Binary probe succeeds (e.g. npx --no-install found it on PATH)
    const result = checkEcosystemItem(item, dir, makeCheckers({ run: () => ({ success: true, output: 'v1.0.0' }) }))
    expect(result.status).toBe('ok')
  })

  it('reports a missing MCP with the install command as hint', () => {
    const item = getEcosystemItem('metro-mcp')!
    const result = checkEcosystemItem(item, dir, makeCheckers())
    expect(result.status).toBe('missing')
    expect(result.hint).toContain('npx')
  })

  it('checks expo-mcp via the expo CLI instead of a standalone package', () => {
    const item = getEcosystemItem('expo-mcp')!
    // expo package installed locally → OK
    const okLocal = checkEcosystemItem(item, dir, makeCheckers({ packageInstalled: name => name === 'expo' }))
    expect(okLocal.status).toBe('ok')
    expect(okLocal.detail).toContain('expo')
    // expo CLI responds on PATH → OK
    const okPath = checkEcosystemItem(item, dir, makeCheckers({ run: () => ({ success: true, output: '0.99.0' }) }))
    expect(okPath.status).toBe('ok')
    // neither → missing with an actionable hint
    const missing = checkEcosystemItem(item, dir, makeCheckers())
    expect(missing.status).toBe('missing')
    expect(missing.hint).toContain('npx expo mcp')
  })

  it('reports a global binary tool (fastlane) by probing PATH', () => {
    const item = getEcosystemItem('fastlane')!
    const ok = checkEcosystemItem(item, dir, makeCheckers({ run: () => ({ success: true, output: 'fastlane 2.220.0' }) }))
    expect(ok.status).toBe('ok')
    const missing = checkEcosystemItem(item, dir, makeCheckers())
    expect(missing.status).toBe('missing')
    expect(missing.hint).toContain('gem install')
  })

  it('reports a skill as OK when its install directory exists', () => {
    const item = getEcosystemItem('expo-router')!
    const result = checkEcosystemItem(item, dir, makeCheckers({ dirExists: d => d.includes('expo-router') }))
    expect(result.status).toBe('ok')
  })

  it('reports a skill as missing with the skills add hint when no dir exists', () => {
    const item = getEcosystemItem('expo-router')!
    const result = checkEcosystemItem(item, dir, makeCheckers())
    expect(result.status).toBe('missing')
    expect(result.hint).toContain('npx skills')
  })

  it('aggregates enabled items into a report with counts', () => {
    mkdirSync(join(dir, '.vectalon'), { recursive: true })
    writeFileSync(
      join(dir, '.vectalon', 'ecosystem.json'),
      JSON.stringify({ version: '1.0.0', enabled: ['zustand', 'fastlane', 'metro-mcp', 'expo-router'] })
    )
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'app', version: '1.0.0' }))

    // zustand installed; fastlane on PATH; metro-mcp + expo-router missing
    const report = runEcosystemDoctor(dir, makeCheckers({
      packageInstalled: name => name === 'zustand',
      run: () => ({ success: true, output: 'ok' }),
    }))
    expect(report.enabledCount).toBe(4)
    expect(report.okCount).toBeGreaterThanOrEqual(2)
    expect(report.missingCount).toBeGreaterThanOrEqual(1)
    expect(report.checks.map(c => c.id)).toEqual(expect.arrayContaining(['zustand', 'fastlane', 'metro-mcp', 'expo-router']))
  })

  it('returns an empty report when nothing is enabled', () => {
    mkdirSync(join(dir, '.vectalon'), { recursive: true })
    writeFileSync(
      join(dir, '.vectalon', 'ecosystem.json'),
      JSON.stringify({ version: '1.0.0', enabled: [] })
    )
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'app', version: '1.0.0' }))
    const report = runEcosystemDoctor(dir, makeCheckers())
    expect(report.enabledCount).toBe(0)
    expect(report.checks).toEqual([])
  })

  it('covers every catalog item with a check (no unhandled category)', () => {
    const items = listEcosystemItems()
    for (const item of items) {
      const result = checkEcosystemItem(item, dir, makeCheckers())
      expect(['ok', 'missing', 'warning']).toContain(result.status)
    }
  })
})
