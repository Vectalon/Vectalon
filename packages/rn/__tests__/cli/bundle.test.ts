import { existsSync, readFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { bundleCommand } from '../../src/cli/commands/bundle'
import { collectBundleSignals } from '../../src/utils/npmSignals'
import { createTempProject, cleanup } from '../helpers/tmp'

jest.mock('@vectalon-dev/core', () => ({
  requireTier: () => ({ allowed: true, currentTier: 'pro', requiredTier: 'pro', canTrial: false }),
}))

jest.mock('../../src/utils/bundleAnalyzer', () => {
  const actual = jest.requireActual('../../src/utils/bundleAnalyzer')
  return {
    ...actual,
    runMetroBundleCommand: jest.fn(async () => ({
      modules: [
        { name: 'node_modules/moment/moment.js', size: 400000, sourcePath: '/app/node_modules/moment/moment.js' },
        { name: 'node_modules/react-native/index.js', size: 350000, sourcePath: '/app/node_modules/react-native/index.js' },
        { name: 'node_modules/lodash/lodash.js', size: 250000, sourcePath: '/app/node_modules/lodash/lodash.js' },
      ],
      assets: [{ name: 'assets/hero.png', size: 300000 }],
    })),
  }
})

jest.mock('../../src/utils/npmSignals', () => {
  const actual = jest.requireActual('../../src/utils/npmSignals')
  return {
    ...actual,
    collectBundleSignals: jest.fn(async () => ({})),
  }
})

jest.mock('../../src/utils/openBrowser', () => ({
  openInBrowser: jest.fn(),
}))

describe('bundleCommand', () => {
  let dir: string

  beforeEach(() => {
    dir = createTempProject({
      'package.json': JSON.stringify({
        name: 'app',
        version: '1.0.0',
        dependencies: { 'react-native': '0.72.0', lodash: '^4.17.21' },
        devDependencies: {},
      }),
    })
    mkdirSync(join(dir, '.vectalon'), { recursive: true })
    jest.spyOn(process.stderr, 'write').mockImplementation(() => true)
    jest.spyOn(process.stdout, 'write').mockImplementation(() => true)
    ;(collectBundleSignals as jest.Mock).mockClear()
  })

  afterEach(() => {
    cleanup(dir)
  })

  it('exits when the project has not been initialized', async () => {
    const uninitialized = createTempProject({ 'package.json': '{}' })
    const exit = jest.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('exit')
    })

    try {
      await expect(bundleCommand(uninitialized, {})).rejects.toThrow('exit')
      expect(exit).toHaveBeenCalledWith(1)
    } finally {
      cleanup(uninitialized)
    }
  })

  it('runs static checks without a Metro build with --static', async () => {
    await expect(bundleCommand(dir, { static: true })).resolves.toBeUndefined()
    expect(existsSync(join(dir, '.vectalon', 'bundle', 'report.html'))).toBe(false)
  })

  it('falls back to static checks when the Metro build is unavailable', async () => {
    const { runMetroBundleCommand } = jest.requireMock('../../src/utils/bundleAnalyzer') as {
      runMetroBundleCommand: jest.Mock
    }
    runMetroBundleCommand.mockResolvedValueOnce(null)
    await expect(bundleCommand(dir, {})).resolves.toBeUndefined()
    expect(existsSync(join(dir, '.vectalon', 'bundle', 'report.html'))).toBe(false)
  })

  it('writes the HTML dashboard + report.json when the build succeeds', async () => {
    await expect(bundleCommand(dir, {})).resolves.toBeUndefined()

    const htmlPath = join(dir, '.vectalon', 'bundle', 'report.html')
    expect(existsSync(htmlPath)).toBe(true)
    const html = readFileSync(htmlPath, 'utf-8')
    expect(html).toContain('vectalon bundle — ios')
    expect(html).toContain('moment')
    expect(html).toContain('dayjs') // curated swap suggestion rendered
    expect(html).toContain('const DATA =')

    const json = JSON.parse(readFileSync(join(dir, '.vectalon', 'bundle', 'report.json'), 'utf-8'))
    expect(json.totalSize).toBe(1000000)
    expect(json.platform).toBe('ios')
  })

  it('--no-html skips the dashboard and the npm signal fetches', async () => {
    await expect(bundleCommand(dir, { html: false })).resolves.toBeUndefined()
    expect(existsSync(join(dir, '.vectalon', 'bundle', 'report.html'))).toBe(false)
    expect(collectBundleSignals).not.toHaveBeenCalled()
  })
})
