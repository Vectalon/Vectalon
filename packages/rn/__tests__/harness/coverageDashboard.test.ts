import { mkdtempSync, existsSync, readFileSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import {
  coverageDocsDir,
  coverageGapsDocPath,
  appendCoverageGapEntry,
  readCoverageGapsDoc,
  parseCoverageGapsDoc,
  summarizeCoverageGaps,
} from '../../src/harness/coverageDashboard'

describe('coverage dashboard doc', () => {
  let tmpDir: string
  let root: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'vectalon-dash-'))
    root = tmpDir
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('creates the doc with a header on the first entry', () => {
    const path = appendCoverageGapEntry(root, {
      date: '2026-08-13',
      workflowId: 'feature-development',
      runId: 'run-1',
      prompt: 'Add a profile feature',
      e2eGaps: [{ screen: 'SettingsScreen', followUpTaskId: 'console-task-9' }],
      a11yGaps: ['SettingsScreen'],
    })

    expect(path).toBe(coverageGapsDocPath(root))
    expect(path).not.toBeNull()
    expect(existsSync(path!)).toBe(true)
    expect(join(root, 'docs', 'vectalon', 'coverage')).toBe(coverageDocsDir(root))

    const doc = readFileSync(path!, 'utf-8')
    expect(doc.startsWith('# Coverage gaps — E2E and accessibility')).toBe(true)
    expect(doc).toContain('## 2026-08-13 — feature-development/run-1')
    expect(doc).toContain('Feature: Add a profile feature')
    expect(doc).toContain('### E2E coverage gaps')
    expect(doc).toContain('- SettingsScreen — follow-up `console-task-9` opened')
    expect(doc).toContain('### Accessibility coverage gaps')
    expect(doc).toContain('- SettingsScreen')
  })

  it('appends subsequent entries, preserving history', () => {
    const first = {
      date: '2026-08-13',
      workflowId: 'feature-development',
      runId: 'run-1',
      prompt: 'Add a profile feature',
      e2eGaps: [{ screen: 'SettingsScreen', followUpTaskId: 'console-task-9' }],
      a11yGaps: ['SettingsScreen'],
    }
    appendCoverageGapEntry(root, first)
    appendCoverageGapEntry(root, {
      ...first,
      date: '2026-08-14',
      runId: 'run-2',
      prompt: 'Add offline queue',
      e2eGaps: [{ screen: 'OfflineQueueScreen' }],
      a11yGaps: ['OfflineQueueScreen', 'Home'],
    })

    const doc = readCoverageGapsDoc(root)
    expect(doc.match(/^## /gm)).toHaveLength(2)
    expect(doc).toContain('## 2026-08-13')
    expect(doc).toContain('## 2026-08-14')
    expect(doc).toContain('Feature: Add offline queue')
    // A gap without a follow-up id is marked as already tracked.
    expect(doc).toContain('- OfflineQueueScreen — already tracked (an open follow-up exists)')
  })

  it('returns an empty string when the doc does not exist yet', () => {
    expect(readCoverageGapsDoc(root)).toBe('')
  })

  it('persists a follow-up task URL when the provider returns one', () => {
    appendCoverageGapEntry(root, {
      date: '2026-08-13',
      workflowId: 'feature-development',
      runId: 'run-1',
      prompt: 'Add a profile feature',
      e2eGaps: [{ screen: 'SettingsScreen', followUpTaskId: 'PROJ-42', followUpTaskUrl: 'https://jira.example.com/browse/PROJ-42' }],
      a11yGaps: [],
    })

    const doc = readCoverageGapsDoc(root)
    expect(doc).toContain('- SettingsScreen — follow-up `PROJ-42` opened ([open task](https://jira.example.com/browse/PROJ-42))')
    const parsed = parseCoverageGapsDoc(doc)
    expect(parsed[0].e2eGaps[0]).toEqual({
      screen: 'SettingsScreen',
      followUpTaskId: 'PROJ-42',
      followUpTaskUrl: 'https://jira.example.com/browse/PROJ-42',
    })
  })

  it('parses entries back and summarizes per-screen gap history', () => {
    appendCoverageGapEntry(root, {
      date: '2026-08-13',
      workflowId: 'feature-development',
      runId: 'run-1',
      prompt: 'Add a profile feature',
      e2eGaps: [{ screen: 'SettingsScreen', followUpTaskId: 'followup-1' }],
      a11yGaps: ['SettingsScreen', 'Home'],
    })
    appendCoverageGapEntry(root, {
      date: '2026-08-14',
      workflowId: 'feature-development',
      runId: 'run-2',
      prompt: 'Add offline queue',
      e2eGaps: [{ screen: 'SettingsScreen' }, { screen: 'OfflineQueueScreen', followUpTaskId: 'followup-2' }],
      a11yGaps: ['SettingsScreen', 'OfflineQueueScreen'],
    })

    const entries = parseCoverageGapsDoc(readCoverageGapsDoc(root))
    expect(entries).toHaveLength(2)
    expect(entries[0].workflowId).toBe('feature-development')
    expect(entries[0].prompt).toBe('Add a profile feature')
    expect(entries[1].e2eGaps.map(g => g.screen)).toEqual(['SettingsScreen', 'OfflineQueueScreen'])
    expect(entries[1].a11yGaps).toEqual(['SettingsScreen', 'OfflineQueueScreen'])

    const summary = summarizeCoverageGaps(entries)
    const settings = summary.find(s => s.screen === 'SettingsScreen')
    expect(settings).toEqual(
      expect.objectContaining({ e2eRuns: 2, a11yRuns: 2, latestDate: '2026-08-14', alreadyTracked: true })
    )
    // Latest run was deduplicated, so the follow-up id from the earlier run is retained.
    expect(settings?.followUpTaskId).toBe('followup-1')
    const queue = summary.find(s => s.screen === 'OfflineQueueScreen')
    expect(queue).toEqual(
      expect.objectContaining({ e2eRuns: 1, a11yRuns: 1, followUpTaskId: 'followup-2', alreadyTracked: false })
    )
    const home = summary.find(s => s.screen === 'Home')
    expect(home).toMatchObject({ e2eRuns: 0, a11yRuns: 1 })
    expect(home?.followUpTaskId).toBeUndefined()
    // Noisiest gaps sort first.
    expect(summary[0].screen).toBe('SettingsScreen')
  })
})
