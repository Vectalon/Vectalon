import { MCPServer } from '../../src/protocol/MCPServer'
import { ContextEngine } from '../../src/harness/ContextEngine'
import { ModelRouter } from '../../src/model/ModelRouter'

// Device-control tools share the real runCommand executor; stub it so the
// live-mode test proves live wiring without executing any device commands.
jest.mock('../../src/adapters/runCommand', () => ({
  runCommand: jest.fn(async () => ({ success: true, stdout: 'MOCKED DEVICE OUTPUT', stderr: '', exitCode: 0 })),
}))
import { existsSync, writeFileSync } from 'fs'
import { join } from 'path'
import { PNG } from 'pngjs'
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
    expect(names).toHaveLength(59)
    expect(names).toEqual(
      expect.arrayContaining([
        'get_project_context',
        'generate_component',
        'write_test',
        'check_guardrails',
        'analyze_error',
        'suggest_dependency_update',
        'analyze_impact',
        'get_learned_patterns',
        'run_agent',
        'execute_workflow',
        'write_prd',
        'write_user_stories',
        'define_acceptance_criteria',
        'analyze_support_tickets',
        'run_gap_analysis',
        'write_test_plan',
        'triage_bugs',
        'analyze_root_cause',
        'analyze_crash',
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
        'device_boot',
        'device_screenshot',
        'device_tap',
        'device_swipe',
        'device_open_url',
        'device_logs',
        'device_set_voiceover',
        'device_accessibility_tree',
        'device_announcements',
        'generate_maestro_flow',
        'plan_release',
        'check_crash_rate',
        'build_training_dataset',
        'scaffold_native_module',
        'visual_capture_reference',
        'visual_check',
        'figma_fetch_design',
        'figma_generate_component',
        'check_design_compliance',
        'plan_upgrade',
        'apply_upgrade',
        'detect_upgrade_state',
        'analyze_hermes_profile',
        'sandbox_run',
        'sandbox_backend',
        'render_component',
      ])
    )
  })

  it('every advertised tool has a callable handler', async () => {
    const server = createServer()
    for (const tool of server.getToolList()) {
      const args: Record<string, unknown> = {}
      if (tool.name === 'generate_component') args.name = 'Button'
      if (tool.name === 'run_agent') args.prompt = 'Test'
      if (tool.name === 'execute_workflow') {
        args.workflowId = 'feature-development'
        args.prompt = 'Create a login screen'
      }
      if (tool.name === 'write_test') args.target = 'Button'
      if (tool.name === 'check_guardrails') args.content = 'const x = 1'
      if (tool.name === 'analyze_error') args.error = 'TypeError: x is not a function'
      if (tool.name === 'analyze_impact') args.changedFiles = 'src/Home.tsx'
      if (tool.name === 'suggest_dependency_update') args.packageName = 'react-native'
      if (tool.name === 'write_prd') args.feature = 'Onboarding'
      if (tool.name === 'write_user_stories') args.feature = 'Onboarding'
      if (tool.name === 'define_acceptance_criteria') args.story = 'As a user, I want to sign up'
      if (tool.name === 'analyze_support_tickets') args.tickets = 'App crashed on startup'
      if (tool.name === 'run_gap_analysis') {
        args.desired = 'sync'
        args.current = 'none'
      }
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
      if (tool.name === 'scaffold_native_module') {
        args.spec = JSON.stringify({ moduleName: 'Battery', methods: [{ name: 'getLevel', returnType: 'number' }] })
      }
      if (tool.name === 'visual_capture_reference') {
        args.key = 'LoginScreen'
      }
      if (tool.name === 'figma_generate_component') {
        args.spec = JSON.stringify({ name: 'Button/Primary', width: 100, height: 44, children: [] })
      }
      if (tool.name === 'check_design_compliance') {
        args.code = 'const x = 1'
        args.spec = JSON.stringify({ name: 'Button', width: 100, height: 44, children: [] })
      }
      if (tool.name === 'plan_release') {
        args.currentVersion = '1.2.3'
        args.gitLog = 'a1b2c3d feat: add login'
      }
      if (tool.name === 'check_crash_rate') {
        args.crashes = JSON.stringify([{ kind: 'crash', id: 'c1', source: 'crashlytics', frames: [] }])
        args.baselineRate = 1.0
      }
      if (tool.name === 'build_training_dataset') {
        args.outDir = '.vectalon/training'
      }
      // apply_upgrade writes files: point it at the temp fixture project
      // (never cwd) so the handler stays callable without touching the repo.
      if (tool.name === 'apply_upgrade') {
        args.directory = dir
        args.to = '0.76'
      }
      // sandbox_run requires an explicit root + command — never defaults to cwd.
      if (tool.name === 'sandbox_run') {
        args.root = dir
        args.command = 'node'
        args.args = ['-e', 'process.stdout.write("ok")']
      }
      // device_tap/device_swipe declare required coordinates (P2-18).
      if (tool.name === 'device_tap') {
        args.x = 100
        args.y = 200
      }
      if (tool.name === 'device_swipe') {
        args.x1 = 0
        args.y1 = 0
        args.x2 = 100
        args.y2 = 200
      }
      if (tool.name === 'device_set_voiceover') {
        args.enabled = true
      }
      if (tool.name === 'figma_fetch_design') {
        args.fileKey = 'abc123'
      }
      if (tool.name === 'device_open_url') {
        args.platform = 'ios'
        args.url = 'myapp://home'
      }
      // render_component compiles + headlessly renders in a temp sandbox.
      if (tool.name === 'render_component') {
        args.files = { 'src/App.tsx': 'import { Text } from "react-native"; export default function App() { return <Text>hi</Text> }' }
        args.entry = 'src/App.tsx'
      }
      // get_rn_upgrade_diff requires from/to; pass an inline diff so the
      // handler parses offline — no network in unit tests.
      if (tool.name === 'get_rn_upgrade_diff') {
        args.from = '0.72.5'
        args.to = '0.76.0'
        args.diff =
          'diff --git a/RnDiffApp/package.json b/RnDiffApp/package.json\n' +
          '--- a/RnDiffApp/package.json\n+++ b/RnDiffApp/package.json\n' +
          '@@ -1 +1 @@\n-old\n+new\n'
      }

      const result = await server.handleToolCall({ id: '1', name: tool.name, arguments: args })
      if (result.isError === true) {
        throw new Error(`tool ${tool.name} errored: ${result.content.slice(0, 200)}`)
      }
      expect(result.content.length).toBeGreaterThan(0)
    }
  })

  it('run_agent runs the local agent loop over the SDK tools', async () => {
    const server = createServer()
    // P2-18: missing required args are a structured validation error, not a
    // handler-level guess.
    const missing = await server.handleToolCall({ id: '0', name: 'run_agent', arguments: {} })
    expect(missing.isError).toBe(true)
    expect(missing.content).toContain('Invalid tool arguments')
    expect(missing.content).toContain('prompt')

    const result = await server.handleToolCall({
      id: '1',
      name: 'run_agent',
      arguments: { prompt: 'Summarize the project' },
    })
    expect(result.isError).not.toBe(true)
    expect(result.content).toContain('## Agent result')
    // No model is downloaded in tests, so the loop reports the unparseable
    // fallback output instead of hallucinating tools.
    expect(result.content).toContain('parseable tool call or answer')
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

  it('check_guardrails returns JSON findings for a snippet', async () => {
    const server = createServer()
    const bad = await server.handleToolCall({
      id: '1',
      name: 'check_guardrails',
      arguments: { filePath: 'src/api/client.ts', content: 'const BASE_URL = "https://api.example.com/v1";' },
    })
    expect(bad.isError).not.toBe(true)
    const parsed = JSON.parse(bad.content)
    expect(parsed.ok).toBe(false)
    const hardcoded = parsed.findings.find((f: { rule: string }) => f.rule === 'No hardcoded API URLs')
    expect(hardcoded?.passed).toBe(false)

    const clean = await server.handleToolCall({
      id: '2',
      name: 'check_guardrails',
      arguments: { filePath: 'src/components/Header.tsx', content: 'const Header = () => <View />;\nexport { Header };' },
    })
    expect(JSON.parse(clean.content).ok).toBe(true)

    const missing = await server.handleToolCall({ id: '3', name: 'check_guardrails', arguments: {} })
    expect(missing.isError).toBe(true)
    expect(missing.content).toContain('Invalid tool arguments')
  })

  it('analyze_impact reports the blast radius for changed files', async () => {
    const server = createServer()
    const result = await server.handleToolCall({
      id: '1',
      name: 'analyze_impact',
      arguments: { changedFiles: 'src/Home.tsx' },
    })
    expect(result.isError).not.toBe(true)
    expect(result.content).toContain('## 🌐 Cross-package impact analysis')
    expect(result.content).toContain('**Changed:** `src/Home.tsx`')

    const missing = await server.handleToolCall({ id: '2', name: 'analyze_impact', arguments: {} })
    expect(missing.isError).toBe(true)
    expect(missing.content).toContain('Invalid tool arguments')
    expect(missing.content).toContain('changedFiles')
  })

  it('plan_release renders a release plan from git log', async () => {
    const server = createServer()
    const result = await server.handleToolCall({
      id: '1',
      name: 'plan_release',
      arguments: { currentVersion: '1.2.3', gitLog: 'a1b2c3d feat: add login\nf1e2d3c fix: crash' },
    })
    expect(result.isError).not.toBe(true)
    expect(result.content).toContain('## 🚀 Release plan')
    expect(result.content).toContain('1.3.0')

    const empty = await server.handleToolCall({
      id: '2',
      name: 'plan_release',
      arguments: { currentVersion: '1.2.3', gitLog: '' },
    })
    expect(empty.isError).not.toBe(true)
    expect(empty.content).toContain('No commits could be parsed')
  })

  it('check_crash_rate flags a spike and files an incident', async () => {
    const server = createServer()
    const crashes = Array.from({ length: 240 }, (_, i) => ({
      kind: 'crash',
      id: `c${i}`,
      source: 'crashlytics',
      exceptionType: 'NSInvalidArgumentException',
      release: '1.3.0',
      frames: [],
    }))
    const result = await server.handleToolCall({
      id: '1',
      name: 'check_crash_rate',
      arguments: { crashes: JSON.stringify(crashes), baselineRate: 1.0 },
    })
    expect(result.isError).not.toBe(true)
    expect(result.content).toContain('## 📡 Release monitor')
    expect(result.content).toContain('Auto-filed incident')
    expect(result.content).toContain('Suggested action: roll back the release.')

    const invalid = await server.handleToolCall({
      id: '2',
      name: 'check_crash_rate',
      arguments: { crashes: 'not json' },
    })
    expect(invalid.isError).not.toBe(true)
    expect(invalid.content).toContain('Could not parse')
  })

  it('device tools default to deterministic dry-run descriptions', async () => {
    const server = createServer()
    const boot = await server.handleToolCall({ id: '1', name: 'device_boot', arguments: {} })
    expect(boot.isError).not.toBe(true)
    expect(boot.content).toContain('[dry-run] xcrun simctl boot')

    const open = await server.handleToolCall({
      id: '2',
      name: 'device_open_url',
      arguments: { platform: 'android', url: 'myapp://home' },
    })
    expect(open.isError).not.toBe(true)
    expect(open.content).toContain('adb shell am start')
    expect(open.content).toContain('myapp://home')

    // Missing coordinates are a structured validation error, not a thrown one.
    const tap = await server.handleToolCall({ id: '3', name: 'device_tap', arguments: {} })
    expect(tap.isError).toBe(true)
    expect(tap.content).toContain('Invalid tool arguments')
    expect(tap.content).toContain('x')

    // Valid coordinates still describe the dry-run command.
    const validTap = await server.handleToolCall({
      id: '4',
      name: 'device_tap',
      arguments: { x: 100, y: 200 },
    })
    expect(validTap.isError).not.toBe(true)
    expect(validTap.content).toContain('[dry-run]')
  })

  it('generate_maestro_flow renders a YAML flow from acceptance criteria', async () => {
    const result = await createServer().handleToolCall({
      id: '1',
      name: 'generate_maestro_flow',
      arguments: {
        acceptanceCriteria: 'Given the user opens the app\nWhen the user taps on "Login"\nThen the user sees "Dashboard"',
        featureName: 'Login',
        appId: 'com.example.app',
      },
    })
    expect(result.isError).not.toBe(true)
    expect(result.content).toContain('appId: "com.example.app"')
    expect(result.content).toContain('- launchApp')
    expect(result.content).toContain('- tapOn: "Login"')
    expect(result.content).toContain('- assertVisible: "Dashboard"')
  })

  it('visual_check diffs two PNG files deterministically without a device', async () => {
    const server = createServer()
    const writePng = (name: string, color: [number, number, number]): string => {
      const png = new PNG({ width: 40, height: 40 })
      for (let i = 0; i < 40 * 40; i++) {
        png.data[i * 4] = color[0]
        png.data[i * 4 + 1] = color[1]
        png.data[i * 4 + 2] = color[2]
        png.data[i * 4 + 3] = 255
      }
      const path = join(dir, name)
      writeFileSync(path, PNG.sync.write(png))
      return path
    }
    const reference = writePng('ref.png', [10, 20, 30])
    const matching = writePng('match.png', [10, 20, 30])
    const different = writePng('diff.png', [200, 0, 0])

    const pass = await server.handleToolCall({
      id: '1',
      name: 'visual_check',
      arguments: { path: matching, reference },
    })
    expect(pass.isError).not.toBe(true)
    expect(pass.content).toContain('passed')

    const fail = await server.handleToolCall({
      id: '2',
      name: 'visual_check',
      arguments: { path: different, reference },
    })
    expect(fail.isError).not.toBe(true)
    expect(fail.content).toContain('found differences')
    expect(fail.content).toContain('visual-drift')
  })

  it('review_code reports design-system compliance against a Figma file', async () => {
    const server = createServer()
    const figmaJson = JSON.stringify({
      name: 'Design',
      document: {
        type: 'DOCUMENT',
        children: [
          {
            type: 'COMPONENT',
            id: 'c1',
            name: 'Button/Primary',
            absoluteBoundingBox: { x: 0, y: 0, width: 200, height: 44 },
            cornerRadius: 8,
            children: [],
          },
        ],
      },
    })
    const code = `export function ButtonPrimary() { return <View style={styles.root} /> }\nconst styles = StyleSheet.create({ root: { height: 52, borderRadius: 8 } })`
    const result = await server.handleToolCall({
      id: '1',
      name: 'review_code',
      arguments: { code, figmaJson },
    })
    expect(result.isError).not.toBe(true)
    expect(result.content).toContain('Design system compliance')
    expect(result.content).toContain('height-drift')
  })

  it('figma_generate_component renders a component from a spec JSON', async () => {
    const server = createServer()
    const result = await server.handleToolCall({
      id: '1',
      name: 'figma_generate_component',
      arguments: {
        spec: JSON.stringify({
          name: 'Button/Primary',
          width: 200,
          height: 44,
          cornerRadius: 8,
          backgroundColor: '#F5331A',
          children: [{ name: 'Label', type: 'TEXT', characters: 'Go', x: 90, y: 12, width: 20, height: 20 }],
        }),
      },
    })
    expect(result.isError).not.toBe(true)
    expect(result.content).toContain('export function ButtonPrimary')
    expect(result.content).toContain('height: 44,')
    expect(result.content).toContain('Go')
  })

  it('figma_fetch_design degrades gracefully without a token', async () => {
    const server = createServer()
    const result = await server.handleToolCall({
      id: '1',
      name: 'figma_fetch_design',
      arguments: { fileKey: 'abc123' },
    })
    expect(result.isError).not.toBe(true)
    expect(result.content).toContain('**Failed**')
    expect(result.content).toContain('FIGMA_TOKEN')
  })

  it('visual_capture_reference stores an imported PNG under the store key', async () => {
    const server = createServer()
    const png = new PNG({ width: 2, height: 2 })
    for (let i = 0; i < 4; i++) png.data[i * 4 + 3] = 255
    const path = join(dir, 'figma-frame.png')
    writeFileSync(path, PNG.sync.write(png))

    const result = await server.handleToolCall({
      id: '1',
      name: 'visual_capture_reference',
      arguments: { key: 'LoginScreen', path },
    })
    expect(result.isError).not.toBe(true)
    expect(result.content).toContain('**OK**')
    expect(existsSync(join(dir, '.vectalon', 'artifacts', 'reference', 'LoginScreen-ios.png'))).toBe(true)
  })

  it('device tools run live only when deviceControlLive is enabled', async () => {
    const engine = new ContextEngine(dir)
    engine.init()
    const router = new ModelRouter()
    router.initialize({ provider: 'local' })
    const server = new MCPServer(engine, router, 'mcp', null, null, [], { deviceControlLive: true })

    // device_logs on Android is quick and side-effect-free even with a device
    // attached (adb logcat -d -t), so it safely proves live mode executes real
    // commands instead of dry-run descriptions — no simulator gets booted.
    const logs = await server.handleToolCall({
      id: '1',
      name: 'device_logs',
      arguments: { platform: 'android', limit: 50 },
    })
    expect(logs.isError).not.toBe(true)
    expect(logs.content.length).toBeGreaterThan(0)
    expect(logs.content).not.toContain('[dry-run]')
  })

  it('safe mode stubs model output and hides file-writing/device tools (P2-17)', async () => {
    const engine = new ContextEngine(dir)
    engine.init()
    const router = new ModelRouter()
    router.initialize({ provider: 'local' })
    const server = new MCPServer(engine, router, 'mcp', null, null, [], { safeMode: true })

    const names = server.getToolList().map(t => t.name)
    expect(names).toContain('check_guardrails') // read-only tools stay
    expect(names).not.toContain('device_boot')
    expect(names).not.toContain('device_tap')
    expect(names).not.toContain('execute_workflow')
    expect(names).not.toContain('build_training_dataset')
    expect(names).not.toContain('scaffold_native_module')

    // A model-backed tool returns the stub, never a real generation.
    const gen = await server.handleToolCall({ id: '1', name: 'generate_component', arguments: { name: 'Button' } })
    expect(gen.isError).not.toBe(true)
    expect(gen.content).toContain('Safe mode')

    // Disabled tools are not callable, even directly.
    const dev = await server.handleToolCall({ id: '2', name: 'device_boot', arguments: {} })
    expect(dev.isError).toBe(true)
    expect(dev.content).toContain('Unknown tool')

    // deviceControlLive is forced off even when explicitly requested.
    const live = new MCPServer(engine, router, 'mcp', null, null, [], { safeMode: true, deviceControlLive: true })
    expect(live.getToolList().some(t => t.name === 'device_boot')).toBe(false)
  })

  it('returns structured errors for missing or wrong-typed required fields (P2-18)', async () => {
    const server = createServer()
    const missing = await server.handleToolCall({
      id: '1',
      name: 'execute_workflow',
      arguments: { workflowId: 'feature-development' },
    })
    expect(missing.isError).toBe(true)
    expect(missing.content).toContain('Invalid tool arguments')
    expect(missing.content).toContain('prompt')

    const wrongType = await server.handleToolCall({
      id: '2',
      name: 'execute_workflow',
      arguments: { workflowId: 'feature-development', prompt: 42 },
    })
    expect(wrongType.isError).toBe(true)
    expect(wrongType.content).toContain('expected string')
  })
})
