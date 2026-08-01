import { mkdtempSync, writeFileSync, mkdirSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { execSync } from 'child_process'
import { createProjectManagementAdapter } from '../../src/adapters/projectManagement'
import { createGitAdapter } from '../../src/adapters/git'
import { createTestRunnerAdapter } from '../../src/adapters/testRunner'
import { createSimulatorAdapter } from '../../src/adapters/simulator'
import { createDesignAdapter } from '../../src/adapters/design'

describe('Adapters', () => {
  describe('project management', () => {
    it('defaults to console adapter', () => {
      const adapter = createProjectManagementAdapter({})
      expect(adapter.name).toBe('console')
    })

    it('creates a Jira adapter when configured', () => {
      const adapter = createProjectManagementAdapter({
        provider: 'jira',
        baseUrl: 'https://example.atlassian.net',
        projectKey: 'MOB',
      })
      expect(adapter.name).toBe('jira')
    })

    it('creates tasks', async () => {
      const adapter = createProjectManagementAdapter({})
      const tasks = await adapter.createTasks([{ title: 'Test', description: 'Test task' }])
      expect(tasks).toHaveLength(1)
      expect(tasks[0].title).toBe('Test')
    })
  })

  describe('git', () => {
    it('defaults to local adapter', () => {
      const adapter = createGitAdapter({})
      expect(adapter.name).toBe('local')
    })

    it('creates a console adapter in dry-run mode', () => {
      const adapter = createGitAdapter({ dryRun: true })
      expect(adapter.name).toBe('console')
    })

    it('creates a GitHub adapter when configured', () => {
      const adapter = createGitAdapter({ provider: 'github', owner: 'acme', repo: 'app' })
      expect(adapter.name).toBe('github')
    })

    it('runs real git commands in a temp repo', async () => {
      const tmpDir = mkdtempSync(join(tmpdir(), 'vectalon-git-'))
      execSync('git init', { cwd: tmpDir })
      execSync('git config user.email "test@example.com"', { cwd: tmpDir })
      execSync('git config user.name "Test"', { cwd: tmpDir })
      writeFileSync(join(tmpDir, 'file.txt'), 'hello')
      execSync('git add .', { cwd: tmpDir })
      execSync('git commit -m "initial"', { cwd: tmpDir })

      const adapter = createGitAdapter({ root: tmpDir })
      await adapter.createBranch('feature/test')
      const branch = execSync('git branch --show-current', { cwd: tmpDir, encoding: 'utf-8' }).trim()
      expect(branch).toBe('feature/test')

      writeFileSync(join(tmpDir, 'new.txt'), 'world')
      const sha = await adapter.commit({ message: 'feat: test' })
      expect(sha.length).toBeGreaterThan(0)
    })
  })

  describe('test runner', () => {
    it('defaults to local adapter', () => {
      const adapter = createTestRunnerAdapter({})
      expect(adapter.name).toBe('local')
    })

    it('creates a console adapter in dry-run mode', () => {
      const adapter = createTestRunnerAdapter({ dryRun: true })
      expect(adapter.name).toBe('console')
    })

    it('creates a Jest adapter when configured', () => {
      const adapter = createTestRunnerAdapter({ provider: 'jest' })
      expect(adapter.name).toBe('jest')
    })

    it('runs a real npm test script in a temp project', async () => {
      const tmpDir = mkdtempSync(join(tmpdir(), 'vectalon-test-'))
      writeFileSync(
        join(tmpDir, 'package.json'),
        JSON.stringify({ name: 'test', version: '1.0.0', scripts: { test: 'echo "all tests passed"' } })
      )

      const adapter = createTestRunnerAdapter({ root: tmpDir })
      const result = await adapter.runTests()
      expect(result.success).toBe(true)
      expect(result.stdout).toContain('all tests passed')
    })
  })

  describe('simulator', () => {
    it('defaults to local adapter', () => {
      const adapter = createSimulatorAdapter({})
      expect(adapter.name).toBe('local')
    })

    it('creates a console adapter in dry-run mode', () => {
      const adapter = createSimulatorAdapter({ dryRun: true })
      expect(adapter.name).toBe('console')
    })

    it('creates an iOS simulator adapter when configured', () => {
      const adapter = createSimulatorAdapter({ provider: 'ios-simulator' })
      expect(adapter.name).toBe('ios-simulator')
    })

    it('returns a result when the real command fails', async () => {
      const tmpDir = mkdtempSync(join(tmpdir(), 'vectalon-sim-'))
      mkdirSync(join(tmpDir, 'node_modules', '.bin'), { recursive: true })
      // A fake react-native binary that exits with code 1 quickly
      writeFileSync(
        join(tmpDir, 'node_modules', '.bin', 'react-native'),
        '#!/bin/sh\necho "no react-native project" >&2\nexit 1\n'
      )
      execSync('chmod +x ' + join(tmpDir, 'node_modules', '.bin', 'react-native'))
      writeFileSync(
        join(tmpDir, 'package.json'),
        JSON.stringify({ name: 'test', version: '1.0.0' })
      )

      const adapter = createSimulatorAdapter({ root: tmpDir })
      const result = await adapter.run({ platform: 'ios' })
      expect(result.success).toBe(false)
      expect(result.exitCode).toBe(1)
    }, 10000)
  })

  describe('design', () => {
    it('returns motion recommendations for button interactions', async () => {
      const adapter = createDesignAdapter({})
      const recommendations = await adapter.analyzeMotion('button press and loading state')
      expect(recommendations.length).toBeGreaterThan(0)
      expect(recommendations.some(r => r.element.includes('Buttons'))).toBe(true)
    })
  })
})
