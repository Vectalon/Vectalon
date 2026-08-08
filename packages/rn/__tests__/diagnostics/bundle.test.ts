import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { createTempProject, cleanup } from '../helpers/tmp'
import { collectDiagnosticsBundle, writeDiagnosticsBundle, listVectalonState } from '../../src/diagnostics/bundle'
import { logger } from '../../src/cli/logger'

describe('--diagnostics bundle (P0-2)', () => {
  let root: string

  beforeEach(() => {
    root = createTempProject({
      'package.json': JSON.stringify({
        name: 'app',
        version: '1.0.0',
        dependencies: { react: '18.2.0', 'react-native': '0.73.0', expo: '50.0.0' },
      }),
      '.vectalon/rn-vectalon.json': JSON.stringify({
        version: '0.1.0',
        projectName: 'app',
        rnVersion: '0.73.0',
        initializedAt: Date.now(),
        modelProvider: 'anthropic',
      }),
      '.vectalon/knowledge/artifacts.json': JSON.stringify({ artifacts: [] }),
      '.vectalon/private-key.pem': 'should-not-be-listed',
    })
  })

  afterEach(() => {
    cleanup(root)
  })

  it('collects environment, project, log tail, and .vectalon state', () => {
    const bundle = collectDiagnosticsBundle({ command: 'init', root })
    expect(bundle.schemaVersion).toBe(1)
    expect(bundle.command).toBe('init')
    expect(bundle.environment.nodeVersion).toMatch(/^v\d+/)
    expect(bundle.environment.os).toBeTruthy()
    expect(bundle.environment.cwd).toBe(root)
    expect(bundle.project.rnVersion).toBe('0.73.0')
    expect(bundle.project.expoVersion).toBe('50.0.0')
    expect(bundle.project.modelProvider).toBe('anthropic')
    expect(bundle.project.projectType).toBe('expo')
    expect(bundle.project.hasVectalonDir).toBe(true)
    expect(Array.isArray(bundle.logLines)).toBe(true)
  })

  it('captures the logger ring buffer tail', () => {
    logger.info('bundle ring test line')
    const bundle = collectDiagnosticsBundle({ command: 'selftest', root })
    expect(bundle.logLines.some(l => l.includes('bundle ring test line'))).toBe(true)
  })

  it('skips secret files (.pem) and lists knowledge files in the state', () => {
    const state = listVectalonState(root)
    const paths = state.map(s => s.path)
    expect(paths.some(p => p.includes('private-key'))).toBe(false)
    expect(paths.some(p => p.includes('artifacts.json'))).toBe(true)
  })

  it('writes diagnostics-bundle.json into .vectalon', () => {
    const path = writeDiagnosticsBundle({ command: 'doctor', root, errorStack: 'Error: demo\n    at demo (file.ts:1:1)' })
    expect(path).toBe(join(root, '.vectalon', 'diagnostics-bundle.json'))
    expect(existsSync(path)).toBe(true)
    const bundle = JSON.parse(readFileSync(path, 'utf-8'))
    expect(bundle.errorStack).toContain('demo')
    expect(bundle.command).toBe('doctor')
  })

  it('detects rn-cli and unknown project types', () => {
    const rnRoot = createTempProject({
      'package.json': JSON.stringify({ dependencies: { 'react-native': '0.72.0' } }),
    })
    const unknownRoot = createTempProject({ 'package.json': '{}' })
    try {
      expect(collectDiagnosticsBundle({ command: 'x', root: rnRoot }).project.projectType).toBe('rn-cli')
      expect(collectDiagnosticsBundle({ command: 'x', root: unknownRoot }).project.projectType).toBe('unknown')
    } finally {
      cleanup(rnRoot)
      cleanup(unknownRoot)
    }
  })
})
