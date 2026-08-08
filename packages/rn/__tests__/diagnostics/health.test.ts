// Deterministic model availability for the health checks (no real downloads).
jest.mock('../../src/model/local/ModelStore', () => ({
  hasDownloadedModel: () => true,
}))
jest.mock('../../src/model/local/presets', () => ({
  getDefaultPreset: () => ({ id: 'qwen2.5-coder-1.5b' }),
}))
jest.mock('../../src/model/local/wasmPresets', () => ({
  wasmCacheReady: () => false,
}))

import { createTempProject, cleanup } from '../helpers/tmp'
import { collectHealthReport, aggregateHealth } from '../../src/diagnostics/health'
import { ModelRouter } from '../../src/model/ModelRouter'
import { ArtifactStore } from '../../src/knowledge/ArtifactStore'

describe('deep /health checks (P0-4)', () => {
  let root: string

  beforeEach(() => {
    root = createTempProject({
      'package.json': JSON.stringify({
        name: 'app',
        version: '1.0.0',
        dependencies: { 'react-native': '0.72.0' },
      }),
      '.vectalon/rn-vectalon.json': JSON.stringify({
        version: '0.1.0',
        projectName: 'app',
        rnVersion: '0.72.0',
        initializedAt: Date.now(),
        modelProvider: 'local',
      }),
    })
  })

  afterEach(() => {
    cleanup(root)
  })

  it('aggregates statuses deterministically', () => {
    expect(aggregateHealth([{ name: 'a', status: 'ok', detail: '' }])).toBe('healthy')
    expect(aggregateHealth([{ name: 'a', status: 'ok', detail: '' }, { name: 'b', status: 'warn', detail: '' }])).toBe('degraded')
    expect(aggregateHealth([{ name: 'a', status: 'warn', detail: '' }, { name: 'b', status: 'fail', detail: '' }])).toBe('critical')
  })

  it('reports healthy on a valid project with a writable store and configured router', async () => {
    const report = await collectHealthReport({
      root,
      modelRouter: new ModelRouter(),
      artifactStore: new ArtifactStore(root, { engine: 'json' }),
      subMcpClients: [],
    })
    expect(report.status).toBe('healthy')
    const names = report.checks.map(c => c.name)
    expect(names).toEqual(expect.arrayContaining(['project-config', 'artifact-store', 'model-provider', 'sub-mcp']))
    expect(report.checks.every(c => c.status === 'ok')).toBe(true)
    expect(report.version).toMatch(/^\d+\.\d+\.\d+/)
  })

  it('fails hard when the project was never initialized', async () => {
    const bare = createTempProject({ 'package.json': '{}' })
    try {
      const report = await collectHealthReport({ root: bare })
      expect(report.status).toBe('critical')
      const config = report.checks.find(c => c.name === 'project-config')
      expect(config!.status).toBe('fail')
    } finally {
      cleanup(bare)
    }
  })

  it('degrades without a model router (deterministic fallback mode)', async () => {
    const report = await collectHealthReport({ root })
    expect(report.status).toBe('degraded')
    const model = report.checks.find(c => c.name === 'model-provider')
    expect(model!.status).toBe('warn')
  })

  it('warns when a remote provider key is missing', async () => {
    const remoteRoot = createTempProject({
      'package.json': JSON.stringify({ dependencies: { 'react-native': '0.72.0' } }),
      '.vectalon/rn-vectalon.json': JSON.stringify({
        version: '0.1.0',
        projectName: 'app',
        rnVersion: '0.72.0',
        initializedAt: Date.now(),
        modelProvider: 'groq',
      }),
    })
    try {
      const router = new ModelRouter()
      router.initialize({ provider: 'groq' })
      const report = await collectHealthReport({ root: remoteRoot, modelRouter: router })
      const model = report.checks.find(c => c.name === 'model-provider')
      // With GROQ_API_KEY unset the check warns (not a hard fail — tools still serve).
      expect(model!.status).toBe('warn')
      expect(model!.detail).toContain('GROQ_API_KEY')
    } finally {
      cleanup(remoteRoot)
    }
  })

  it('probes keyless remote providers for reachability', async () => {
    const ollamaRoot = createTempProject({
      'package.json': JSON.stringify({ dependencies: { 'react-native': '0.72.0' } }),
      '.vectalon/rn-vectalon.json': JSON.stringify({
        version: '0.1.0',
        projectName: 'app',
        rnVersion: '0.72.0',
        initializedAt: Date.now(),
        modelProvider: 'ollama',
      }),
    })
    try {
      const router = new ModelRouter()
      router.initialize({ provider: 'ollama' })
      const report = await collectHealthReport({
        root: ollamaRoot,
        modelRouter: router,
        probeTimeoutMs: 2000,
      })
      const model = report.checks.find(c => c.name === 'model-provider')
      // Ollama's baseUrl (http://localhost:11434) may or may not be running on
      // this machine — accept either, but the check must have run (not warn).
      expect(model!.status === 'ok' || model!.status === 'fail').toBe(true)
    } finally {
      cleanup(ollamaRoot)
    }
  })

  it('flags unresponsive sub-MCP clients as a warning', async () => {
    const report = await collectHealthReport({
      root,
      subMcpClients: [{ tools: [] }] as never,
    })
    const sub = report.checks.find(c => c.name === 'sub-mcp')
    expect(sub!.status).toBe('warn')
  })
})
