import { readFileSync } from 'fs'
import { join } from 'path'
import { wireMetroReporter } from '../../src/daemon/metroWiring'
import { createTempProject, cleanup } from '../helpers/tmp'

describe('wireMetroReporter', () => {
  it('patches a simple module.exports object and is idempotent', () => {
    const dir = createTempProject({
      'metro.config.js': 'module.exports = {\n  transformer: {},\n}\n',
    })

    const first = wireMetroReporter(dir)
    expect(first.wired).toBe(true)
    expect(first.file).toContain('metro.config.js')

    const content = readFileSync(join(dir, 'metro.config.js'), 'utf-8')
    expect(content).toContain("reporter: require('./.vectalon/metro/vectalon-reporter.js')")

    const second = wireMetroReporter(dir)
    expect(second.wired).toBe(false)
    expect(second.reason).toBe('already-wired')
    expect(readFileSync(join(dir, 'metro.config.js'), 'utf-8')).toBe(content)
    cleanup(dir)
  })

  it('handles metro.config.cjs', () => {
    const dir = createTempProject({ 'metro.config.cjs': 'module.exports = {}' })

    const result = wireMetroReporter(dir)

    expect(result.wired).toBe(true)
    expect(result.file).toContain('metro.config.cjs')
    expect(readFileSync(join(dir, 'metro.config.cjs'), 'utf-8')).toContain('vectalon-reporter')
    cleanup(dir)
  })

  it('reports when there is no metro config', () => {
    const dir = createTempProject({})
    expect(wireMetroReporter(dir)).toEqual({ wired: false, reason: 'no-metro-config' })
    cleanup(dir)
  })

  it('does not mangle an unrecognized config shape', () => {
    const dir = createTempProject({
      'metro.config.js': 'const config = { transformer: {} };\nmodule.exports = config;\n',
    })

    const result = wireMetroReporter(dir)

    expect(result.wired).toBe(false)
    expect(result.reason).toBe('unrecognized-config-shape')
    expect(readFileSync(join(dir, 'metro.config.js'), 'utf-8')).not.toContain('vectalon-reporter')
    cleanup(dir)
  })
})
