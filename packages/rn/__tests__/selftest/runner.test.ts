import { runSelfTest, runOneCheck, totalsForRuns } from '../../src/selftest/runner'
import type { FeatureCheck } from '../../src/selftest/types'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { createTempProject, cleanup } from '../helpers/tmp'
import { resetConfig, setConfig, getConfig } from '../../src/config'
import { captureError } from '../../src/diagnostics/errorReporter'
import { getFeatureCheck } from '../../src/selftest/catalog'

describe('runSelfTest', () => {
  it.each(['diagnostics-error-queue', 'diagnostics-heartbeat', 'diagnostics-support'])('runs %s against isolated local fixtures', async id => {
    const run = await runOneCheck(getFeatureCheck(id)!)
    expect({ status: run.status, error: run.error }).toEqual({ status: 'pass', error: undefined })
  })
  it('isolates injected diagnostics and preserves customer opt-out configuration', async () => {
    const root = createTempProject({})
    const previous = process.env.RN_VECTALON_CONFIG_DIR
    process.env.RN_VECTALON_CONFIG_DIR = root
    resetConfig()
    setConfig('telemetry.enabled', false)
    setConfig('sentinel', 'customer settings')
    const original = readFileSync(join(root, 'config.json'), 'utf-8')
    try {
      const run = await runOneCheck({
        id: 'diagnostics-isolation', name: 'Diagnostics isolation', category: 'diagnostics', description: 'Isolated capture',
        run(ctx) {
          const captured = captureError(new Error('fixture'), 'selftest', undefined, {
            enabled: true, queuePath: join(ctx.sandbox.root, 'queue.json'),
          })
          return { status: captured ? 'pass' : 'fail', detail: 'fixture captured' }
        },
      })
      expect(run.status).toBe('pass')
      expect(process.env.RN_VECTALON_CONFIG_DIR).toBe(root)
      expect(readFileSync(join(root, 'config.json'), 'utf-8')).toBe(original)
      expect(getConfig('telemetry.enabled')).toBe(false)
      expect(existsSync(join(root, 'client.json'))).toBe(false)
    } finally {
      resetConfig()
      if (previous === undefined) delete process.env.RN_VECTALON_CONFIG_DIR
      else process.env.RN_VECTALON_CONFIG_DIR = previous
      cleanup(root)
    }
  })
  it('aggregates totals and by-category stats', async () => {
    const report = await runSelfTest({ only: 'sdlc-release-planner' })
    expect(report.totals.total).toBe(1)
    expect(report.totals.pass).toBe(1)
    expect(report.byCategory.sdlc).toMatchObject({ pass: 1, total: 1 })
    expect(Array.isArray(report.runs[0].steps)).toBe(true)
  })

  it('captures a throwing check as a failure with an error stack', async () => {
    const boom: FeatureCheck = {
      id: 'test-boom',
      name: 'Boom',
      category: 'cli',
      description: 'Always throws',
      run() {
        throw new Error('kaboom')
      },
    }
    const run = await runOneCheck(boom)
    expect(run.status).toBe('fail')
    expect(run.detail).toBe('kaboom')
    expect(run.error).toContain('kaboom')
  })

  it('captures a returning fail result', async () => {
    const nope: FeatureCheck = {
      id: 'test-nope',
      name: 'Nope',
      category: 'cli',
      description: 'Returns fail',
      run() {
        return { status: 'fail', detail: 'intentional' }
      },
    }
    const run = await runOneCheck(nope)
    expect(run.status).toBe('fail')
    expect(run.detail).toBe('intentional')
  })

  it('totalsForRuns counts statuses', () => {
    const totals = totalsForRuns([
      { status: 'pass' } as never,
      { status: 'fail' } as never,
      { status: 'warn' } as never,
    ])
    expect(totals).toMatchObject({ pass: 1, fail: 1, warn: 1, total: 3 })
  })
})
