import { ConsoleProjectManagementAdapter } from '../../src/adapters/projectManagement'

describe('ConsoleProjectManagementAdapter', () => {
  it('finds open tasks by title fragment and labels, and skips closed ones', async () => {
    const pm = new ConsoleProjectManagementAdapter()
    await pm.createTasks([
      { title: 'Follow-up: E2E coverage for SettingsScreen', description: '', labels: ['coverage', 'SettingsScreen'] },
      { title: 'Acceptance: SettingsScreen not regressed', description: '' },
    ])

    // Matches only the labeled follow-up (title fragment + label AND).
    const open = await pm.findTasks({ title: 'SettingsScreen', labels: ['SettingsScreen'] })
    expect(open).toHaveLength(1)
    expect(open[0].title).toBe('Follow-up: E2E coverage for SettingsScreen')

    // Closing it removes it from dedup queries.
    await pm.closeTasks([open[0].id])
    expect(await pm.findTasks({ title: 'SettingsScreen', labels: ['SettingsScreen'] })).toHaveLength(0)
  })

  it('returns nothing when the filter matches no open task', async () => {
    const pm = new ConsoleProjectManagementAdapter()
    await pm.createTasks([{ title: 'Something else', description: '', labels: ['other'] }])
    expect(await pm.findTasks({ title: 'SettingsScreen', labels: ['SettingsScreen'] })).toHaveLength(0)
  })

  it('assigns ids that never restart across createTasks calls (dedup-safe store keys)', async () => {
    const pm = new ConsoleProjectManagementAdapter()
    const first = await pm.createTasks([{ title: 'A', description: '' }, { title: 'B', description: '' }])
    const second = await pm.createTasks([{ title: 'C', description: '' }])
    expect(first.map(t => t.id)).toEqual(['console-task-1', 'console-task-2'])
    expect(second.map(t => t.id)).toEqual(['console-task-3'])
  })
})
