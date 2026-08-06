import { existsSync, mkdirSync, readFileSync } from 'fs'
import { join } from 'path'
import {
  buildMetroReporterSource,
  writeMetroReporter,
  hasMetroReporter,
  metroReporterPath,
} from '../../src/daemon/metroReporter'
import { createTempProject, cleanup } from '../helpers/tmp'

describe('metro reporter', () => {
  it('generates a CJS reporter that streams bundle events to the daemon', () => {
    const source = buildMetroReporterSource()

    expect(source).toContain('module.exports = ({ reporter }) => {')
    expect(source).toContain('reporter.update(')
    expect(source).toContain('/ingest/metro')
    expect(source).toContain('bundle_build_done')
    expect(source).toContain('bundle_build_failed')
    // Reads the daemon port from the state file so a daemon restart with a
    // different port keeps working.
    expect(source).toContain('daemon.json')
    // The build must never break because the daemon is offline.
    expect(source).toContain("req.on('error', () => {})")
    // A hung daemon must not pin sockets in Metro.
    expect(source).toContain('req.setTimeout(2000')
  })

  it('writes the reporter under .vectalon/metro', () => {
    const dir = createTempProject({})
    mkdirSync(join(dir, '.vectalon'), { recursive: true })

    const file = writeMetroReporter(dir)

    expect(file).toBe(metroReporterPath(dir))
    expect(existsSync(file)).toBe(true)
    expect(readFileSync(file, 'utf-8')).toContain('/ingest/metro')
    expect(hasMetroReporter(dir)).toBe(true)
    cleanup(dir)
  })
})
