import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { initCommand } from '../../src/cli/commands/init'
import {
  detectInitState,
  snapshotProjectFiles,
  restoreProjectFiles,
  cleanPartialArtifacts,
  readInitState,
  writeInitState,
  createInitState,
  INIT_PHASES,
} from '../../src/cli/commands/init/transaction'
import * as ecosystem from '../../src/ecosystem'
import { createTempProject, cleanup, useTempConfig } from '../helpers/tmp'

describe('init transaction — state detection', () => {
  it('reports a fresh project as new', () => {
    const dir = createTempProject({ 'package.json': '{}' })
    try {
      const detection = detectInitState(dir)
      expect(detection.status).toBe('new')
    } finally {
      cleanup(dir)
    }
  })

  it('reports a completed init as complete', () => {
    const dir = createTempProject({})
    try {
      writeInitState(dir, { ...createInitState(dir, []), status: 'complete', completedPhases: [...INIT_PHASES] })
      expect(detectInitState(dir).status).toBe('complete')
    } finally {
      cleanup(dir)
    }
  })

  it('reports an in-progress state marker as dirty', () => {
    const dir = createTempProject({})
    try {
      writeInitState(dir, { ...createInitState(dir, [], 'model download crashed'), status: 'in-progress', completedPhases: ['scan', 'memory'] })
      const detection = detectInitState(dir)
      expect(detection.status).toBe('dirty')
      expect(detection.dirtyReason).toContain('model download crashed')
    } finally {
      cleanup(dir)
    }
  })

  it('reports a manifest without a state marker as dirty (interrupted init)', () => {
    const dir = createTempProject({
      '.vectalon/rn-vectalon.json': JSON.stringify({ version: '0.1.0', modelProvider: 'local' }),
    })
    try {
      const detection = detectInitState(dir)
      expect(detection.status).toBe('dirty')
      expect(detection.dirtyReason).toContain('without an init-state marker')
    } finally {
      cleanup(dir)
    }
  })

  it('reports a corrupt manifest as dirty', () => {
    const dir = createTempProject({ '.vectalon/rn-vectalon.json': '{ not json' })
    try {
      const detection = detectInitState(dir)
      expect(detection.status).toBe('dirty')
      expect(detection.dirtyReason).toContain('not valid JSON')
    } finally {
      cleanup(dir)
    }
  })
})

describe('init transaction — snapshot + rollback', () => {
  it('restores original contents and deletes files created during init', () => {
    const dir = createTempProject({ '.gitignore': 'node_modules\n' })
    try {
      const snapshots = snapshotProjectFiles(dir)
      // Simulate init writes.
      mkdirSync(join(dir, '.vectalon'), { recursive: true })
      writeFileSync(join(dir, '.vectalon', 'rn-vectalon.json'), '{}')
      writeFileSync(join(dir, '.gitignore'), 'node_modules\n.vectalon/\n')

      const restored = restoreProjectFiles(dir, snapshots)
      expect(restored.length).toBeGreaterThanOrEqual(2)
      expect(existsSync(join(dir, '.vectalon', 'rn-vectalon.json'))).toBe(false)
      expect(readFileSync(join(dir, '.gitignore'), 'utf-8')).toBe('node_modules\n')
    } finally {
      cleanup(dir)
    }
  })

  it('cleanPartialArtifacts removes .vectalon init files but leaves .gitignore alone', () => {
    const dir = createTempProject({
      '.gitignore': 'node_modules\n.vectalon/\n',
      '.vectalon/rn-vectalon.json': '{}',
      '.vectalon/snapshot.json': '{}',
      '.vectalon/ecosystem.json': '{}',
    })
    try {
      const removed = cleanPartialArtifacts(dir)
      expect(removed).toEqual(expect.arrayContaining(['.vectalon/rn-vectalon.json', '.vectalon/snapshot.json', '.vectalon/ecosystem.json']))
      expect(existsSync(join(dir, '.vectalon', 'rn-vectalon.json'))).toBe(false)
      expect(readFileSync(join(dir, '.gitignore'), 'utf-8')).toContain('.vectalon/')
    } finally {
      cleanup(dir)
    }
  })
})

describe('initCommand — idempotency and rollback (P0-6)', () => {
  let configDir: string

  beforeEach(() => {
    configDir = useTempConfig()
  })

  afterEach(() => cleanup(configDir))

  function project(): string {
    return createTempProject({
      'package.json': JSON.stringify({
        name: 'app',
        version: '1.0.0',
        dependencies: { 'react-native': '0.72.0' },
      }),
      '.gitignore': 'node_modules\n',
    })
  }

  it('is idempotent: a completed init is a no-op on the second run', async () => {
    const dir = project()
    try {
      await initCommand(dir, { model: 'local' })
      const state = readInitState(dir)!
      expect(state.status).toBe('complete')
      expect(state.completedPhases).toEqual([...INIT_PHASES])

      const gitignoreBefore = readFileSync(join(dir, '.gitignore'), 'utf-8')
      await initCommand(dir, { model: 'local' })
      expect(readFileSync(join(dir, '.gitignore'), 'utf-8')).toBe(gitignoreBefore)
      // Still exactly one .vectalon/ entry.
      const matches = gitignoreBefore.split('\n').filter(l => l.trim() === '.vectalon/')
      expect(matches).toHaveLength(1)
    } finally {
      cleanup(dir)
    }
  })

  it('--force re-runs an already-initialized project', async () => {
    const dir = project()
    try {
      await initCommand(dir, { model: 'local' })
      await initCommand(dir, { model: 'openai', force: true })
      const manifest = JSON.parse(readFileSync(join(dir, '.vectalon', 'rn-vectalon.json'), 'utf-8'))
      expect(manifest.modelProvider).toBe('openai')
    } finally {
      cleanup(dir)
    }
  })

  it('records an in-progress state with rollback snapshots when a phase fails', async () => {
    const dir = project()
    try {
      const spy = jest.spyOn(ecosystem, 'applyEcosystemRecommendations').mockImplementation(() => {
        throw new Error('boom: ecosystem setup failed')
      })
      try {
        await expect(initCommand(dir, { model: 'local' })).rejects.toThrow('boom')
      } finally {
        spy.mockRestore()
      }

      // The failure is persisted so the next run can resume or clean-restart.
      const state = readInitState(dir)!
      expect(state.status).toBe('in-progress')
      expect(state.failureReason).toContain('boom')
      expect(state.rollback.length).toBeGreaterThanOrEqual(5)
      expect(state.completedPhases).toEqual(expect.arrayContaining(['scan', 'memory', 'gitignore', 'model', 'manifest']))

      // The project is mid-write: manifest exists, gitignore appended.
      expect(existsSync(join(dir, '.vectalon', 'rn-vectalon.json'))).toBe(true)
      expect(readFileSync(join(dir, '.gitignore'), 'utf-8')).toContain('.vectalon/')

      // Rollback restores the pre-init state.
      restoreProjectFiles(dir, state.rollback)
      expect(existsSync(join(dir, '.vectalon', 'rn-vectalon.json'))).toBe(false)
      expect(readFileSync(join(dir, '.gitignore'), 'utf-8')).toBe('node_modules\n')
    } finally {
      cleanup(dir)
    }
  })

  it('--clean-restart recovers from a failed init and completes', async () => {
    const dir = project()
    try {
      const spy = jest.spyOn(ecosystem, 'applyEcosystemRecommendations').mockImplementation(() => {
        throw new Error('boom')
      })
      try {
        await expect(initCommand(dir, { model: 'local' })).rejects.toThrow('boom')
      } finally {
        spy.mockRestore()
      }

      // Clean restart: rollback then full re-init succeeds.
      await initCommand(dir, { model: 'local', cleanRestart: true })
      const state = readInitState(dir)!
      expect(state.status).toBe('complete')
      expect(existsSync(join(dir, '.vectalon', 'rn-vectalon.json'))).toBe(true)
    } finally {
      cleanup(dir)
    }
  })
})
