import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { ensureCiConfigs, generateEasWorkflow, generateGithubActionsWorkflow } from '../../src/adapters/ciTemplates'
import { createTempProject, cleanup } from '../helpers/tmp'

const RN_PKG = {
  'package.json': JSON.stringify({
    name: 'app',
    version: '1.0.0',
    scripts: {
      lint: 'eslint src',
      typecheck: 'tsc --noEmit',
      test: 'jest',
      'prettier:check': 'prettier --check .',
    },
    dependencies: { 'react-native': '0.72.0' },
    devDependencies: { jest: '29.7.0' },
  }),
}

const EXPO_PKG = {
  'package.json': JSON.stringify({
    name: 'app',
    version: '1.0.0',
    scripts: {
      lint: 'expo lint',
      test: 'jest',
    },
    dependencies: { expo: '~52.0.0' },
  }),
}

describe('ciTemplates', () => {
  let dir: string

  beforeEach(() => {
    dir = createTempProject({})
    mkdirSync(join(dir, '.vectalon'), { recursive: true })
  })

  afterEach(() => {
    cleanup(dir)
  })

  describe('generateGithubActionsWorkflow', () => {
    it('maps the detected scripts and package manager into steps', () => {
      for (const [name, content] of Object.entries(RN_PKG)) {
        writeFileSync(join(dir, name), content)
      }
      writeFileSync(join(dir, 'yarn.lock'), '')

      const workflow = generateGithubActionsWorkflow(dir)
      expect(workflow).toContain('name: vectalon-ci')
      expect(workflow).toContain('on:')
      expect(workflow).toContain('pull_request:')
      expect(workflow).toContain('runs-on: ubuntu-latest')
      expect(workflow).toContain('actions/checkout@v4')
      expect(workflow).toContain('cache: yarn')
      expect(workflow).toContain('yarn install --immutable')
      expect(workflow).toContain('corepack enable')
      expect(workflow).toContain('yarn lint')
      expect(workflow).toContain('yarn typecheck')
      expect(workflow).toContain('yarn prettier:check')
      expect(workflow).toContain('yarn test')
    })

    it('emits native checks (pod install / gradle) as a second job', () => {
      for (const [name, content] of Object.entries(RN_PKG)) {
        writeFileSync(join(dir, name), content)
      }
      mkdirSync(join(dir, 'ios'), { recursive: true })
      writeFileSync(join(dir, 'ios', 'Podfile'), '# pods')
      mkdirSync(join(dir, 'android'), { recursive: true })
      writeFileSync(join(dir, 'android', 'gradlew'), '#!/bin/sh')

      const workflow = generateGithubActionsWorkflow(dir)
      expect(workflow).toContain('jobs:')
      expect(workflow).toContain('  quality:')
      expect(workflow).toContain('  native:')
      expect(workflow).toContain('pod install')
      expect(workflow).toContain('./gradlew clean')
    })
  })

  describe('generateEasWorkflow', () => {
    it('generates a .eas/workflows YAML with steps for an Expo project', () => {
      for (const [name, content] of Object.entries(EXPO_PKG)) {
        writeFileSync(join(dir, name), content)
      }

      const workflow = generateEasWorkflow(dir)
      expect(workflow).toContain('name: vectalon-ci')
      expect(workflow).toContain('jobs:')
      expect(workflow).toContain('  quality:')
      expect(workflow).toContain('- run: npm ci')
      expect(workflow).toContain('- run: npm run lint')
      expect(workflow).toContain('- run: npm run test')
      expect(workflow).toContain('on:')
      expect(workflow).toContain('pull_request:')
    })
  })

  describe('ensureCiConfigs', () => {
    it('writes the GitHub Actions workflow for bare RN CLI projects', () => {
      for (const [name, content] of Object.entries(RN_PKG)) {
        writeFileSync(join(dir, name), content)
      }

      const result = ensureCiConfigs(dir, { isExpo: false })
      expect(result).toEqual([{ path: '.github/workflows/vectalon-ci.yml', written: true }])
      expect(existsSync(join(dir, '.github', 'workflows', 'vectalon-ci.yml'))).toBe(true)
      expect(readFileSync(join(dir, '.github', 'workflows', 'vectalon-ci.yml'), 'utf-8')).toContain('name: vectalon-ci')
    })

    it('writes the EAS workflow for Expo projects', () => {
      for (const [name, content] of Object.entries(EXPO_PKG)) {
        writeFileSync(join(dir, name), content)
      }

      const result = ensureCiConfigs(dir, { isExpo: true })
      expect(result[0].path).toBe('.eas/workflows/vectalon.yml')
      expect(result[0].written).toBe(true)
      expect(existsSync(join(dir, '.eas', 'workflows', 'vectalon.yml'))).toBe(true)
    })

    it('never overwrites an existing workflow', () => {
      for (const [name, content] of Object.entries(RN_PKG)) {
        writeFileSync(join(dir, name), content)
      }
      const workflowPath = join(dir, '.github', 'workflows', 'vectalon-ci.yml')
      mkdirSync(join(dir, '.github', 'workflows'), { recursive: true })
      writeFileSync(workflowPath, '# user authored workflow')

      const result = ensureCiConfigs(dir, { isExpo: false })
      expect(result[0].written).toBe(false)
      expect(readFileSync(workflowPath, 'utf-8')).toBe('# user authored workflow')
    })
  })
})
