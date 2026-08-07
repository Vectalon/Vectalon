import { runSelfTest, runOneCheck, totalsForRuns } from '../../src/selftest/runner'
import type { FeatureCheck } from '../../src/selftest/types'

describe('runSelfTest', () => {
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
