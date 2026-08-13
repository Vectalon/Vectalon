import { createTempProject, cleanup, useTempConfig } from '../helpers/tmp'
import { coverageCommand } from '../../src/cli/commands/coverage'
import { appendCoverageGapEntry } from '../../src/harness'

describe('coverageCommand', () => {

  let dir: string
  let configDir: string

  beforeEach(() => {
    dir = createTempProject({})
    configDir = useTempConfig()
    jest.spyOn(process.stderr, 'write').mockImplementation(() => true)
  })

  afterEach(() => {
    cleanup(dir)
    cleanup(configDir)
  })

  it('prints the per-screen gap summary with open-task links', async () => {
    appendCoverageGapEntry(dir, {
      date: '2026-08-13',
      workflowId: 'feature-development',
      runId: 'run-1',
      prompt: 'Add a profile feature',
      e2eGaps: [{ screen: 'SettingsScreen', followUpTaskId: 'followup-1' }],
      a11yGaps: ['SettingsScreen', 'Home'],
    })
    appendCoverageGapEntry(dir, {
      date: '2026-08-14',
      workflowId: 'feature-development',
      runId: 'run-2',
      prompt: 'Add offline queue',
      e2eGaps: [{ screen: 'SettingsScreen' }, { screen: 'OfflineQueueScreen', followUpTaskId: 'PROJ-42', followUpTaskUrl: 'https://jira.example.com/browse/PROJ-42' }],
      a11yGaps: ['OfflineQueueScreen'],
    })

    const out = jest.spyOn(process.stdout, 'write').mockImplementation(() => true)
    await coverageCommand(dir, {})

    const written = out.mock.calls.map(c => String(c[0])).join('')
    expect(written).toContain('# Coverage gaps — E2E and accessibility')
    expect(written).toContain('docs/vectalon/coverage/coverage-gaps.md')
    expect(written).toContain('2 run(s) (2026-08-13 → 2026-08-14)')
    // Per-screen table with run counts.
    expect(written).toContain('| SettingsScreen | 2 | 1 |')
    expect(written).toContain('| OfflineQueueScreen | 1 | 1 |')
    expect(written).toContain('| Home | 0 | 1 |')
    // Open-task link from the latest run; deduplicated screen keeps its
    // earlier task id, marked as already tracked.
    expect(written).toContain('[`PROJ-42`](https://jira.example.com/browse/PROJ-42)')
    expect(written).toContain('`followup-1` (tracked)')
  })

  it('prints JSON with --json', async () => {
    appendCoverageGapEntry(dir, {
      date: '2026-08-13',
      workflowId: 'feature-development',
      runId: 'run-1',
      prompt: 'Add a profile feature',
      e2eGaps: [{ screen: 'SettingsScreen', followUpTaskId: 'followup-1' }],
      a11yGaps: ['SettingsScreen'],
    })

    const out = jest.spyOn(process.stdout, 'write').mockImplementation(() => true)
    await coverageCommand(dir, { json: true })

    const parsed = JSON.parse(out.mock.calls.map(c => String(c[0])).join(''))
    expect(parsed.docPath).toBe('docs/vectalon/coverage/coverage-gaps.md')
    expect(parsed.entries).toBe(1)
    expect(parsed.screens).toHaveLength(1)
    expect(parsed.screens[0]).toEqual(
      expect.objectContaining({ screen: 'SettingsScreen', e2eRuns: 1, a11yRuns: 1, followUpTaskId: 'followup-1' })
    )
  })

  it('honors --limit for the table rows', async () => {
    // SettingsScreen is flagged in both runs (4 gap marks), OfflineQueueScreen
    // only once (2) — so SettingsScreen ranks first and survives the cap.
    const first = {
      date: '2026-08-13',
      workflowId: 'feature-development',
      runId: 'run-1',
      prompt: 'Add a profile feature',
      e2eGaps: [{ screen: 'SettingsScreen', followUpTaskId: 'followup-1' }, { screen: 'OfflineQueueScreen', followUpTaskId: 'followup-2' }],
      a11yGaps: ['SettingsScreen', 'OfflineQueueScreen'],
    }
    appendCoverageGapEntry(dir, first)
    appendCoverageGapEntry(dir, {
      ...first,
      runId: 'run-2',
      e2eGaps: [{ screen: 'SettingsScreen', followUpTaskId: 'followup-3' }],
      a11yGaps: ['SettingsScreen'],
    })

    const out = jest.spyOn(process.stdout, 'write').mockImplementation(() => true)
    await coverageCommand(dir, { limit: 1 })

    const written = out.mock.calls.map(c => String(c[0])).join('')
    expect(written).toContain('| SettingsScreen |')
    expect(written).not.toContain('| OfflineQueueScreen |')
  })

  it('reports a missing dashboard on stderr without a failure', async () => {
    const err = jest.spyOn(process.stderr, 'write').mockImplementation(() => true)
    const out = jest.spyOn(process.stdout, 'write').mockImplementation(() => true)
    await coverageCommand(dir, {})
    const stderr = err.mock.calls.map(c => String(c[0])).join('')
    expect(stderr).toContain('No coverage dashboard yet')
    expect(out.mock.calls).toHaveLength(0)
  })
})
