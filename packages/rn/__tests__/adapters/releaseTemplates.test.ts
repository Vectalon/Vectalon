import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { ensureReleaseConfigs, generateGithubReleaseWorkflow, generateEasReleaseWorkflow } from '../../src/adapters/releaseTemplates'
import { createTempProject, cleanup } from '../helpers/tmp'

const RN_PROJECT = {
  'package.json': JSON.stringify({
    name: 'app',
    version: '1.0.0',
    dependencies: { 'react-native': '0.76.0' },
    scripts: { test: 'jest', lint: 'eslint .', typecheck: 'tsc --noEmit' },
  }),
  '.maestro/home.yaml': 'appId: com.example.app\ntests:\n  - launchApp\n',
}

describe('generateGithubReleaseWorkflow', () => {
  it('generates a release workflow with quality, E2E, submit, and monitor jobs', () => {
    const dir = createTempProject(RN_PROJECT)
    try {
      const workflow = generateGithubReleaseWorkflow(dir, { isExpo: false, packageName: 'com.example.app' })
      expect(workflow).toContain('name: vectalon-release')
      expect(workflow).toContain('workflow_dispatch')
      expect(workflow).toContain('schedule:')
      expect(workflow).toContain('  quality:')
      expect(workflow).toContain('  e2e:')
      expect(workflow).toContain('maestro test .maestro')
      expect(workflow).toContain('  verify:')
      expect(workflow).toContain('vectalon@latest smoke --full --json')
      expect(workflow).toContain('needs: [verify]')
      expect(workflow).toContain('  submit:')
      expect(workflow).toContain('fastlane supply')
      expect(workflow).toContain('  monitor:')
      expect(workflow).toContain('vectalon release --monitor')
    } finally {
      cleanup(dir)
    }
  })

  it('skips the E2E job when no Maestro flows exist', () => {
    const dir = createTempProject({
      'package.json': JSON.stringify({ name: 'app', version: '1.0.0', dependencies: { 'react-native': '0.76.0' } }),
    })
    try {
      const workflow = generateGithubReleaseWorkflow(dir, { isExpo: false })
      expect(workflow).not.toContain('  e2e:')
      expect(workflow).toContain('  quality:')
      expect(workflow).toContain('  verify:')
      expect(workflow).toContain('  monitor:')
    } finally {
      cleanup(dir)
    }
  })
})

describe('generateEasReleaseWorkflow', () => {
  it('generates an EAS release workflow with submit and monitor jobs', () => {
    const dir = createTempProject({
      'package.json': JSON.stringify({ name: 'expo-app', version: '1.0.0', dependencies: { expo: '~52.0.0' } }),
    })
    try {
      const workflow = generateEasReleaseWorkflow(dir, { isExpo: true })
      expect(workflow).toContain('name: vectalon-release')
      expect(workflow).toContain('  verify:')
      expect(workflow).toContain('vectalon@latest smoke --full --json')
      expect(workflow).toContain('eas build --platform all')
      expect(workflow).toContain('eas submit --platform all')
      expect(workflow).toContain('vectalon release --monitor')
    } finally {
      cleanup(dir)
    }
  })
})

describe('ensureReleaseConfigs', () => {
  it('writes the GitHub Actions release workflow for bare RN CLI', () => {
    const dir = createTempProject(RN_PROJECT)
    try {
      const result = ensureReleaseConfigs(dir, { isExpo: false })
      expect(result).toHaveLength(1)
      expect(result[0].written).toBe(true)
      expect(result[0].path).toBe(join('.github', 'workflows', 'vectalon-release.yml'))
      expect(existsSync(join(dir, '.github', 'workflows', 'vectalon-release.yml'))).toBe(true)
    } finally {
      cleanup(dir)
    }
  })

  it('writes the EAS workflow for Expo and is idempotent', () => {
    const dir = createTempProject({
      'package.json': JSON.stringify({ name: 'expo-app', version: '1.0.0', dependencies: { expo: '~52.0.0' } }),
    })
    try {
      const first = ensureReleaseConfigs(dir, { isExpo: true })
      expect(first[0].path).toBe(join('.eas', 'workflows', 'vectalon-release.yml'))
      expect(first[0].written).toBe(true)

      const second = ensureReleaseConfigs(dir, { isExpo: true })
      expect(second[0].written).toBe(false) // never overwrites

      const content = readFileSync(join(dir, '.eas', 'workflows', 'vectalon-release.yml'), 'utf-8')
      expect(content).toContain('name: vectalon-release')
    } finally {
      cleanup(dir)
    }
  })
})
