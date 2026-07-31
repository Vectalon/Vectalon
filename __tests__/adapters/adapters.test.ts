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
    it('defaults to console adapter', () => {
      const adapter = createGitAdapter({})
      expect(adapter.name).toBe('console')
    })

    it('creates a GitHub adapter when configured', () => {
      const adapter = createGitAdapter({ provider: 'github', owner: 'acme', repo: 'app' })
      expect(adapter.name).toBe('github')
    })

    it('returns a PR object', async () => {
      const adapter = createGitAdapter({})
      const pr = await adapter.createPullRequest({
        title: 'feat: login',
        body: 'Adds login.',
        head: 'feature/login',
      })
      expect(pr.url).toBeDefined()
      expect(pr.number).toBeGreaterThan(0)
    })
  })

  describe('test runner', () => {
    it('defaults to console adapter', () => {
      const adapter = createTestRunnerAdapter({})
      expect(adapter.name).toBe('console')
    })

    it('creates a Jest adapter when configured', () => {
      const adapter = createTestRunnerAdapter({ provider: 'jest' })
      expect(adapter.name).toBe('jest')
    })

    it('returns a successful test result', async () => {
      const adapter = createTestRunnerAdapter({})
      const result = await adapter.runTests()
      expect(result.success).toBe(true)
    })
  })

  describe('simulator', () => {
    it('defaults to console adapter', () => {
      const adapter = createSimulatorAdapter({})
      expect(adapter.name).toBe('console')
    })

    it('creates an iOS simulator adapter when configured', () => {
      const adapter = createSimulatorAdapter({ provider: 'ios-simulator' })
      expect(adapter.name).toBe('ios-simulator')
    })

    it('returns a successful simulator result', async () => {
      const adapter = createSimulatorAdapter({})
      const result = await adapter.run({ platform: 'ios' })
      expect(result.success).toBe(true)
    })
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
