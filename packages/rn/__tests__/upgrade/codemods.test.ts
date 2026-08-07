import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { createTempProject, cleanup } from '../helpers/tmp'
import { planUpgrade } from '../../src/upgrade/planner'
import { applyUpgradeCodemods, applyEditsToContent } from '../../src/upgrade/codemods'
import { runUpgrade } from '../../src/upgrade'

const FIXTURE: Record<string, string> = {
  'package.json': JSON.stringify({
    name: 'app',
    version: '1.0.0',
    dependencies: { react: '18.2.0', 'react-native': '0.72.5' },
  }),
  'android/gradle.properties': 'newArchEnabled=false\n',
  'android/build.gradle': 'enableHermes true\n',
}

describe('applyEditsToContent', () => {
  it('supports write/replace/insert/remove semantics', () => {
    const { content, failed } = applyEditsToContent('const a = 1;\n', [
      { path: 'x', action: 'insert', original: 'const a = 1;', updated: '\nconst b = 2;', detail: '' },
      { path: 'x', action: 'replace', original: 'const a', updated: 'const aa', detail: '' },
      { path: 'x', action: 'remove', original: ' = 2;', updated: '', detail: '' },
    ])
    expect(failed).toEqual([])
    expect(content).toBe('const aa = 1;\nconst b\n')
  })

  it('reports failures when the anchor is missing', () => {
    const { failed } = applyEditsToContent('abc', [{ path: 'x', action: 'replace', original: 'zzz', updated: 'q', detail: '' }])
    expect(failed.length).toBe(1)
  })
})

describe('applyUpgradeCodemods', () => {
  it('applies auto steps, backs up originals, and writes a provenance manifest', () => {
    const dir = createTempProject(FIXTURE)
    try {
      const plan = planUpgrade(dir, { to: '0.76', dryRun: true })
      const report = applyUpgradeCodemods(dir, plan, { force: false })

      expect(report.applied).toBe(true)
      expect(report.edits.length).toBeGreaterThan(0)

      const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf-8')) as { dependencies: Record<string, string> }
      expect(pkg.dependencies['react-native']).toBe('0.76.0')
      expect(pkg.dependencies.react).toBe('18.3.1')

      const gradle = readFileSync(join(dir, 'android/build.gradle'), 'utf-8')
      expect(gradle).not.toContain('enableHermes')

      // Provenance manifest + backups.
      expect(report.provenance.manifest).toBeTruthy()
      const manifest = JSON.parse(readFileSync(join(dir, report.provenance.manifest as string), 'utf-8'))
      expect(manifest.appliedEdits.length).toBeGreaterThan(0)
      expect(manifest.schema).toBe('vectalon-upgrade/1')
      const backup = join(dir, '.vectalon', 'upgrades', 'backups')
      expect(existsSync(backup)).toBe(true)
      expect(existsSync(join(dir, report.provenance.report as string))).toBe(true)
    } finally {
      cleanup(dir)
    }
  })

  it('skips review steps without --force and applies them with --force', () => {
    const dir = createTempProject({
      ...FIXTURE,
      'android/build.gradle': [
        'ext { kotlinVersion = "1.8.10"; compileSdkVersion = 33; minSdkVersion = 21 }',
        'enableHermes true',
      ].join('\n'),
    })
    try {
      const plan = planUpgrade(dir, { to: '0.77', dryRun: true })
      const withoutForce = applyUpgradeCodemods(dir, plan, { force: false })
      const kotlinNoForce = withoutForce.edits.find(e => e.detail.startsWith('kotlinVersion'))
      expect(kotlinNoForce).toBeUndefined()

      // Reset the fixture (apply on the fresh copy again).
      const dir2 = createTempProject({
        ...FIXTURE,
        'android/build.gradle': [
          'ext { kotlinVersion = "1.8.10"; compileSdkVersion = 33; minSdkVersion = 21 }',
          'enableHermes true',
        ].join('\n'),
      })
      try {
        const plan2 = planUpgrade(dir2, { to: '0.77', dryRun: true })
        const withForce = applyUpgradeCodemods(dir2, plan2, { force: true })
        expect(withForce.edits.some(e => e.detail.startsWith('kotlinVersion'))).toBe(true)
      } finally {
        cleanup(dir2)
      }
    } finally {
      cleanup(dir)
    }
  })
})

describe('runUpgrade end-to-end', () => {
  it('never writes when dry-run even with apply requested', async () => {
    const dir = createTempProject(FIXTURE)
    try {
      const report = await runUpgrade(dir, { to: '0.76', apply: true, dryRun: true, verify: false })
      expect(report.applied).toBe(false)
      const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf-8'))
      expect(pkg.dependencies['react-native']).toBe('0.72.5')
    } finally {
      cleanup(dir)
    }
  })

  it('applies + verifies with a passing bundle fallback', async () => {
    const dir = createTempProject(FIXTURE)
    try {
      const report = await runUpgrade(dir, { to: '0.76', apply: true, dryRun: false, verify: true })
      expect(report.applied).toBe(true)
      expect(report.verify).not.toBeNull()
      expect(report.verify?.passed).toBe(true)
      expect(report.verify?.checks.some(c => c.id === 'bundle')).toBe(true)
      const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf-8'))
      expect(pkg.dependencies['react-native']).toBe('0.76.0')
    } finally {
      cleanup(dir)
    }
  })
})
