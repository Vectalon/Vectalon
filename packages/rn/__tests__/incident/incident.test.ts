/**
 * vectalon incident — Incident Commander Agent (Roadmap 097) — hermetic tests.
 * Business Source License 1.1 (BSL-1.1)
 */
import { writeFileSync } from 'fs'
import { runIncident, frameToPath, recentCommitsForFile } from '../../src/incident'
import { createTempProject, cleanup } from '../helpers/tmp'

const JS_CRASH = [
  "TypeError: Cannot read properties of null (reading 'data')",
  '    at renderItem (src/components/Item.tsx:12:5)',
  '    at FlatList (node_modules/@react-native/virtualized-lists/Lists/FlatList.js:900:10)',
  '    at render (src/screens/Home.tsx:88:18)',
].join('\n')

describe('incident: frameToPath', () => {
  let dir: string
  afterEach(() => cleanup(dir))

  it('extracts an existing source path from a frame', () => {
    dir = createTempProject({ 'src/components/Item.tsx': '// x\n' })
    expect(frameToPath('renderItem — src/components/Item.tsx:12', dir)).toBe('src/components/Item.tsx')
  })

  it('returns null for paths that do not exist', () => {
    dir = createTempProject({})
    expect(frameToPath('fn — src/ghost.ts:1', dir)).toBeNull()
  })
})

describe('incident: runIncident', () => {
  let dir: string
  afterEach(() => cleanup(dir))

  it('returns an explicit no-data brief without a log or prior report', () => {
    dir = createTempProject({ 'package.json': '{}' })
    const report = runIncident(dir)
    expect(report.verdict).toBe('changes-requested')
    expect(report.rootCause).toBe('no-data')
    expect(report.hotFiles).toHaveLength(0)
  })

  it('builds a brief from a crash log, pinning hot files', () => {
    dir = createTempProject({
      'src/components/Item.tsx': 'export const Item = () => null\n',
      'src/screens/Home.tsx': 'export const Home = () => null\n',
    })
    const logPath = `${dir}/crash.log`
    writeFileSync(logPath, JS_CRASH, 'utf-8')
    const report = runIncident(dir, { log: logPath })
    expect(report.platform).toBe('javascript')
    expect(report.rootCause).not.toBe('no-data')
    expect(report.source).toBe(logPath)
    const files = report.hotFiles.map(h => h.file)
    expect(files).toContain('src/components/Item.tsx')
    expect(report.nextSteps.length).toBeGreaterThan(0)
  })

  it('reuses the latest crash report when no log is given', () => {
    dir = createTempProject({
      'docs/vectalon/crash/report.json': JSON.stringify({
        platform: 'android',
        exceptionType: 'NullPointerException',
        message: 'NullPointerException',
        topFrames: ['com.example.MainActivity.onCreate — app/src/main/java/com/example/MainActivity.kt:12'],
        finding: { bucket: 'null-reference', probableCause: 'unchecked null', severity: 'error', fix: 'guard the null', investigation: ['reproduce'] },
      }),
    })
    const report = runIncident(dir)
    expect(report.source).toBe('latest crash report')
    expect(report.platform).toBe('android')
    expect(report.rootCause).toBe('null-reference')
    expect(report.verdict).toBe('changes-requested')
  })
})

describe('incident: recentCommitsForFile', () => {
  it('degrades to [] outside a git repo', () => {
    const dir = createTempProject({})
    expect(recentCommitsForFile(dir, 'src/x.ts')).toEqual([])
    cleanup(dir)
  })
})
