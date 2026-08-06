import { mkdtempSync, writeFileSync, mkdirSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { execSync } from 'child_process'
import { createProjectManagementAdapter } from '../../src/adapters/projectManagement'
import { createGitAdapter } from '../../src/adapters/git'
import { createTestRunnerAdapter } from '../../src/adapters/testRunner'
import { createSimulatorAdapter } from '../../src/adapters/simulator'
import { createDesignAdapter } from '../../src/adapters/design'
import * as runCommandModule from '../../src/adapters/runCommand'

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

    it('reads a deterministic stub ticket from the console adapter', async () => {
      const adapter = createProjectManagementAdapter({})
      const ticket = await adapter.readTicket('MOB-123')
      expect(ticket).not.toBeNull()
      expect(ticket!.key).toBe('MOB-123')
      expect(ticket!.title).toBe('MOB-123')
      expect(ticket!.fetched).toBe(false)
    })

    it('falls back to the stub ticket for Jira without credentials', async () => {
      const adapter = createProjectManagementAdapter({ provider: 'jira', baseUrl: 'https://example.atlassian.net', projectKey: 'MOB' })
      const ticket = await adapter.readTicket('MOB-42')
      expect(ticket).not.toBeNull()
      expect(ticket!.key).toBe('MOB-42')
      expect(ticket!.fetched).toBe(false)
    })

    it('creates a GitHub issue adapter when configured', () => {
      const adapter = createProjectManagementAdapter({ provider: 'github', root: '/tmp/x', owner: 'acme', repo: 'app' })
      expect(adapter.name).toBe('github')
    })

    it('reads a live GitHub ticket via the gh CLI', async () => {
      const spy = jest.spyOn(runCommandModule, 'runCommand').mockResolvedValue({
        success: true,
        stdout: JSON.stringify({ number: 7, title: 'Add login screen', body: 'Users need to sign in.', url: 'https://github.com/acme/app/issues/7' }),
        stderr: '',
        exitCode: 0,
      })
      try {
        const adapter = createProjectManagementAdapter({ provider: 'github', root: '/tmp/repo', owner: 'acme', repo: 'app' })
        const ticket = await adapter.readTicket('7')
        expect(ticket).not.toBeNull()
        expect(ticket!.title).toBe('Add login screen')
        expect(ticket!.description).toContain('sign in')
        expect(ticket!.url).toContain('issues/7')
        expect(ticket!.fetched).toBe(true)
        const [cmd, args] = spy.mock.calls[0]
        expect(cmd).toBe('gh')
        expect(args).toEqual(expect.arrayContaining(['issue', 'view', '7', '--json']))
      } finally {
        spy.mockRestore()
      }
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

    it('never passes the --silent flag for yarn (yarn 2+ rejects it)', async () => {
      const tmpDir = mkdtempSync(join(tmpdir(), 'vectalon-yarn-'))
      writeFileSync(
        join(tmpDir, 'package.json'),
        JSON.stringify({ name: 'test', version: '1.0.0', scripts: { test: 'echo hi' } })
      )
      writeFileSync(join(tmpDir, 'yarn.lock'), '')

      const spy = jest.spyOn(runCommandModule, 'runCommand').mockResolvedValue({
        success: true,
        stdout: 'hi',
        stderr: '',
        exitCode: 0,
      })
      const adapter = createTestRunnerAdapter({ root: tmpDir })
      await adapter.runTests()

      const [cmd, args] = spy.mock.calls[0]
      expect(cmd).toBe('yarn')
      expect(args).toEqual(['test'])
      expect(args).not.toContain('--silent')
      spy.mockRestore()
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
