import { MCPServer } from '../../src/protocol/MCPServer'
import { ContextEngine } from '../../src/harness/ContextEngine'
import { ModelRouter } from '../../src/model/ModelRouter'
import { resetConfig } from '../../src/config'
import type { Pattern, PatternStore } from '../../src/memory/PatternLearner'
import { createTempProject, cleanup, useTempConfig } from '../helpers/tmp'

const PROJECT = {
  'package.json': JSON.stringify({
    name: 'app',
    version: '1.0.0',
    dependencies: { 'react-native': '0.72.0' },
    devDependencies: { jest: '29.7.0' },
  }),
  'src/Home.tsx': [
    "import React from 'react'",
    'const Home = () => null',
    'export default Home',
    '',
  ].join('\n'),
}

function fakeStore(patterns: Pattern[]): PatternStore {
  return {
    getActivePatterns: () => patterns.filter(p => p.confidence > 0.3),
    getPatternsByCategory: (category: string) => patterns.filter(p => p.category === category),
  }
}

function makePattern(overrides: Partial<Pattern>): Pattern {
  return {
    id: 'naming-pascal',
    pattern: 'PascalCase components',
    description: 'Uses PascalCase naming',
    confidence: 0.9,
    occurrences: 3,
    firstSeen: 1,
    lastSeen: 2,
    category: 'naming',
    ...overrides,
  }
}

describe('MCPServer', () => {
  let dir: string
  let configDir: string

  beforeEach(() => {
    dir = createTempProject(PROJECT)
    configDir = useTempConfig()
    resetConfig()
  })

  afterEach(() => {
    cleanup(dir)
    cleanup(configDir)
  })

  function createServer() {
    const engine = new ContextEngine(dir)
    engine.init()
    const router = new ModelRouter()
    router.initialize({ provider: 'local' })
    return new MCPServer(engine, router)
  }

  it('advertises the core, workflow, BA, QA, architecture, and ops tools', () => {
    const names = createServer().getToolList().map(t => t.name)
    expect(names).toHaveLength(27)
    expect(names).toEqual(
      expect.arrayContaining([
        'get_project_context',
        'generate_component',
        'write_test',
        'analyze_error',
        'suggest_dependency_update',
        'get_learned_patterns',
        'execute_workflow',
        'write_prd',
        'write_user_stories',
        'define_acceptance_criteria',
        'analyze_support_tickets',
        'run_gap_analysis',
        'write_test_plan',
        'triage_bugs',
        'analyze_root_cause',
        'review_code',
        'suggest_refactors',
        'write_adr',
        'analyze_tradeoffs',
        'threat_model',
        'check_accessibility',
        'extract_design_system',
        'generate_wireframe',
        'write_release_notes',
        'analyze_incident',
        'write_runbook',
        'analyze_kpis',
      ])
    )
  })

  it('every advertised tool has a callable handler', async () => {
    const server = createServer()
    for (const tool of server.getToolList()) {
      const args: Record<string, unknown> = {}
      if (tool.name === 'generate_component') args.name = 'Button'
      if (tool.name === 'execute_workflow') {
        args.workflowId = 'feature-development'
        args.prompt = 'Create a login screen'
      }
      if (tool.name === 'write_test') args.target = 'Button'
      if (tool.name === 'analyze_error') args.error = 'TypeError: x is not a function'
      if (tool.name === 'suggest_dependency_update') args.packageName = 'react-native'
      if (tool.name === 'write_prd') args.feature = 'Onboarding'
      if (tool.name === 'write_user_stories') args.feature = 'Onboarding'
      if (tool.name === 'define_acceptance_criteria') args.story = 'As a user, I want to sign up'
      if (tool.name === 'analyze_support_tickets') args.tickets = 'App crashed on startup'
      if (tool.name === 'run_gap_analysis') args.desired = 'sync'
      if (tool.name === 'write_test_plan') args.feature = 'Onboarding'
      if (tool.name === 'triage_bugs') args.bugs = 'App crashed on startup'
      if (tool.name === 'analyze_root_cause') args.issue = 'null is not an object'
      if (tool.name === 'review_code') args.code = 'console.log(1)'
      if (tool.name === 'suggest_refactors') args.code = 'const x = 1'
      if (tool.name === 'write_adr') {
        args.title = 'Use TypeScript'
        args.context = 'We need types'
      }
      if (tool.name === 'analyze_tradeoffs') args.options = JSON.stringify([{ name: 'A', scores: { cost: 2 } }])
      if (tool.name === 'threat_model') args.feature = 'Login'
      if (tool.name === 'check_accessibility') args.code = '<Image source={require("./a.png")} />'
      if (tool.name === 'extract_design_system') args.code = "color: '#FF5500'"
      if (tool.name === 'generate_wireframe') args.title = 'Login'
      if (tool.name === 'write_release_notes') {
        args.version = '1.1.0'
        args.changes = 'Add camera onboarding\nFix login crash'
      }
      if (tool.name === 'analyze_incident') {
        args.title = 'Outage'
        args.description = 'App is down for all users'
      }
      if (tool.name === 'write_runbook') args.title = 'Restart the backend'
      if (tool.name === 'analyze_kpis') {
        args.metrics = JSON.stringify([{ name: 'Retention', current: 75, previous: 60, target: 70 }])
      }

      const result = await server.handleToolCall({ id: '1', name: tool.name, arguments: args })
      expect(result.isError).not.toBe(true)
      expect(result.content.length).toBeGreaterThan(0)
    }
  })

  it('returns an error result for unknown tools', async () => {
    const result = await createServer().handleToolCall({ id: '1', name: 'nope', arguments: {} })
    expect(result.isError).toBe(true)
    expect(result.content).toContain('Unknown tool')
  })

  it('get_project_context returns the project prompt', async () => {
    const result = await createServer().handleToolCall({
      id: '1',
      name: 'get_project_context',
      arguments: {},
    })
    expect(result.content).toContain('# Project: app v1.0.0')
  })

  it('get_learned_patterns returns learned patterns, not components', async () => {
    const engine = new ContextEngine(dir)
    engine.init()
    engine.attachPatternStore(fakeStore([makePattern({})]))
    const router = new ModelRouter()
    router.initialize({ provider: 'local' })
    const server = new MCPServer(engine, router)

    const result = await server.handleToolCall({
      id: '1',
      name: 'get_learned_patterns',
      arguments: {},
    })
    expect(result.isError).not.toBe(true)
    expect(result.content).toContain('naming-pascal')
    expect(result.content).not.toContain('Home.tsx')
  })

  it('suggest_dependency_update reports an available update', async () => {
    const result = await createServer().handleToolCall({
      id: '1',
      name: 'suggest_dependency_update',
      arguments: { packageName: 'react-native' },
    })
    const suggestion = JSON.parse(result.content)
    expect(suggestion.packageName).toBe('react-native')
    expect(suggestion.currentVersion).toBe('0.72.0')
    expect(suggestion.status).toBe('update-available')
    expect(suggestion.message).toContain('npm install')
  })

  it('suggest_dependency_update reports packages that are not installed', async () => {
    const result = await createServer().handleToolCall({
      id: '1',
      name: 'suggest_dependency_update',
      arguments: { packageName: 'zzz-not-real' },
    })
    const suggestion = JSON.parse(result.content)
    expect(suggestion.status).toBe('not-installed')
  })

  it('analyze_error proxies to the model layer', async () => {
    const result = await createServer().handleToolCall({
      id: '1',
      name: 'analyze_error',
      arguments: { error: 'null is not an object' },
    })
    expect(result.content).toContain('Analyze this React Native error')
  })

  it('generate_component proxies to the model layer with the component name', async () => {
    const result = await createServer().handleToolCall({
      id: '1',
      name: 'generate_component',
      arguments: { name: 'Button' },
    })
    expect(result.content).toContain('Button')
  })

  it('write_test proxies to the model layer', async () => {
    const result = await createServer().handleToolCall({
      id: '1',
      name: 'write_test',
      arguments: { target: 'Home.tsx' },
    })
    expect(result.content).toContain('jest')
    expect(result.content).toContain('Home.tsx')
  })
})
