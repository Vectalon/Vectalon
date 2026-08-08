import { existsSync, readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import {
  attachFileLogging,
  detachFileLogging,
  writeLogLine,
  getLogFilePath,
  LOG_FILE_NAME,
  LOG_MAX_FILES,
} from '../../src/cli/logfile'
import { createTempProject, cleanup } from '../helpers/tmp'

describe('rotating file logger (P1-12)', () => {
  afterEach(() => {
    detachFileLogging()
  })

  it('attaches and writes ISO-timestamped lines with level', () => {
    const dir = createTempProject({})
    try {
      const path = attachFileLogging(dir, { maxBytes: 10_000_000 })
      expect(path).toBe(join(dir, '.vectalon', 'logs', LOG_FILE_NAME))
      expect(getLogFilePath()).toBe(path)

      writeLogLine('warn', 'something is off')
      writeLogLine('info', 'hello world')

      const content = readFileSync(path!, 'utf-8')
      const lines = content.trim().split('\n')
      expect(lines).toHaveLength(2)
      expect(lines[0]).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z \[warn\] something is off$/)
      expect(lines[1]).toMatch(/\[info\] hello world$/)
    } finally {
      cleanup(dir)
    }
  })

  it('rotates the active file into .1 … .4 and keeps at most 5 files', () => {
    const dir = createTempProject({})
    try {
      // Tiny cap: every ~1 KB of writes rotates.
      attachFileLogging(dir, { maxBytes: 1024 })
      const logsDir = join(dir, '.vectalon', 'logs')

      // ~6 rotations worth of data.
      const chunk = 'x'.repeat(200)
      for (let i = 0; i < 40; i++) {
        writeLogLine('info', `${i} ${chunk}`)
      }
      // Rotation renames the active file away; one more write recreates it.
      writeLogLine('info', 'final line')

      const files = readdirSync(logsDir).sort()
      // vectalon.log + .1 .. .4 — never more than LOG_MAX_FILES.
      expect(files.filter(f => f.startsWith(LOG_FILE_NAME))).toHaveLength(LOG_MAX_FILES)
      expect(files).toContain(`${LOG_FILE_NAME}.4`)
      expect(files).not.toContain(`${LOG_FILE_NAME}.5`)

      // The active file stays under the cap.
      expect(statSync(join(logsDir, LOG_FILE_NAME)).size).toBeLessThanOrEqual(1024)
    } finally {
      cleanup(dir)
    }
  })

  it('keeps rotated content intact and ordered (newest in the active file)', () => {
    const dir = createTempProject({})
    try {
      attachFileLogging(dir, { maxBytes: 256 })
      writeLogLine('info', 'first line')
      writeLogLine('info', 'second line')
      // Force a rotation by crossing the cap: first+second+third move to .1.
      writeLogLine('info', 'third line ' + 'y'.repeat(400))
      // The rotation renamed the active file away; this write recreates it.
      writeLogLine('info', 'fourth line')

      const logsDir = join(dir, '.vectalon', 'logs')
      const active = readFileSync(join(logsDir, LOG_FILE_NAME), 'utf-8')
      const shard1 = existsSync(join(logsDir, `${LOG_FILE_NAME}.1`))
        ? readFileSync(join(logsDir, `${LOG_FILE_NAME}.1`), 'utf-8')
        : ''
      expect(active).toContain('fourth line')
      expect(active).not.toContain('first line')
      expect(shard1).toContain('first line')
      expect(shard1).toContain('third line')
    } finally {
      cleanup(dir)
    }
  })

  it('is a no-op when not attached and never throws on bad paths', () => {
    expect(getLogFilePath()).toBeNull()
    expect(() => writeLogLine('error', 'nothing attached')).not.toThrow()

    // An unwritable root (a plain file path) must degrade to null, not throw.
    const dir = createTempProject({ 'blocked': 'file-not-dir' })
    try {
      const path = attachFileLogging(join(dir, 'blocked'), { maxBytes: 100 })
      expect(path).toBeNull()
      expect(() => writeLogLine('error', 'still no crash')).not.toThrow()
    } finally {
      cleanup(dir)
    }
  })
})
