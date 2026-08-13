import { mkdtempSync, rmSync, existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { closePhase } from '../../src/workflows/phases/closePhase'
import type { WorkflowContext, TaskInput } from '../../src/adapters/types'

function makeCtx(
  impactOutput: string,
  projectRoot: string,
  existingTasks: Array<{ title: string; labels?: string[]; status: string }> = []
): WorkflowContext {
  const pm = {
    name: 'stub',
    createTasks: jest.fn(async (ts: TaskInput[]) =>
      ts.map((t, i) => ({ id: `followup-${i + 1}`, title: t.title, description: t.description, status: 'todo' }))
    ),
    updateTasks: jest.fn(),
    closeTasks: jest.fn(async () => {}),
    readTicket: jest.fn(async () => null),
    // Filter like the console adapter: title fragment AND any matching label.
    findTasks: jest.fn(async (filter: { title?: string; labels?: string[] }) =>
      existingTasks.filter(t => {
        if (filter.title && !t.title.toLowerCase().includes(filter.title.toLowerCase())) return false
        if (filter.labels && filter.labels.length > 0 && !filter.labels.some(l => t.labels?.includes(l))) return false
        return true
      })
    ),
  }
  return {
    projectRoot,
    snapshot: null,
    prompt: 'Add a profile feature',
    inputs: {},
    outputs: {},
    state: {
      id: 'close-ctx-test',
      workflowId: 'feature-development',
      prompt: 'Add a profile feature',
      status: 'running',
      createdAt: 0,
      updatedAt: 0,
      phases: [
        {
          id: 'impact',
          name: 'Impact analysis',
          description: '',
          status: 'completed',
          output: impactOutput,
          artifacts: [],
        },
        {
          id: 'tasks',
          name: 'Task creation',
          description: '',
          status: 'completed',
          output: '',
          artifacts: [{ type: 'requirements', title: 'Tasks', content: 'console-task-1 console-task-2' }],
        },
      ],
    },
    adapters: {
      projectManagement: pm,
    } as unknown as WorkflowContext['adapters'],
    modelRouter: {} as unknown as WorkflowContext['modelRouter'],
  }
}

describe('closePhase', () => {
  let tmpDir: string
  let projectRoot: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'vectalon-close-'))
    projectRoot = tmpDir
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('closes the feature tasks and opens follow-ups for impact screens with no deterministic route', async () => {
    const ctx = makeCtx(
      [
        '### Screens & routes touched',
        '- ProfileScreen (deep-linkable)',
        '- Home (initial route)',
        '- SettingsScreen (no deterministic route)',
        '',
      ].join('\n'),
      projectRoot
    )
    const result = await closePhase.run(ctx)

    expect(result.status).toBe('completed')

    // The feature's own tasks are still closed.
    const pm = ctx.adapters.projectManagement as unknown as {
      closeTasks: jest.Mock
      createTasks: jest.Mock
    }
    expect(pm.closeTasks).toHaveBeenCalledWith(['console-task-1', 'console-task-2'])

    // One follow-up per uncovered screen — never for reachable ones.
    const created = pm.createTasks.mock.calls[0][0] as TaskInput[]
    expect(created).toHaveLength(1)
    expect(created[0].title).toBe('Follow-up: E2E coverage for SettingsScreen')
    expect(created[0].description).toContain('no deterministic route')
    expect(created[0].description).toContain('.maestro/')
    expect(created[0].type).toBe('qa')
    // The coverage label + screen name make the follow-up filterable on boards.
    expect(created[0].labels).toEqual(['coverage', 'SettingsScreen'])

    expect(result.output).toContain('Closed 2 task(s)')
    expect(result.output).toContain('Opened 1 follow-up task(s)')
    expect(result.output).toContain('Follow-up: E2E coverage for SettingsScreen')
  })

  it('opens no follow-ups when every affected screen is reachable', async () => {
    const ctx = makeCtx(
      [
        '### Screens & routes touched',
        '- ProfileScreen (deep-linkable)',
        '- Home (initial route)',
        '',
      ].join('\n'),
      projectRoot
    )
    const result = await closePhase.run(ctx)

    expect(result.status).toBe('completed')
    const pm = ctx.adapters.projectManagement as unknown as { createTasks: jest.Mock }
    expect(pm.createTasks).not.toHaveBeenCalled()
    expect(result.output).not.toContain('follow-up')
  })

  it('opens no follow-ups when the impact report is empty or unannotated', async () => {
    const empty = await closePhase.run(makeCtx('', projectRoot))
    expect(empty.status).toBe('completed')
    expect(empty.output).not.toContain('follow-up')

    // Legacy report with unannotated screens — not flagged, no follow-ups.
    const legacy = await closePhase.run(
      makeCtx('### Screens & routes touched\n- ProfileScreen\n', projectRoot)
    )
    expect(legacy.status).toBe('completed')
    expect(legacy.output).not.toContain('follow-up')
  })

  it('skips a follow-up when an open task for the same screen already exists', async () => {
    const ctx = makeCtx(
      [
        '### Screens & routes touched',
        '- SettingsScreen (no deterministic route)',
        '- OfflineQueueScreen (no deterministic route)',
        '',
      ].join('\n'),
      projectRoot,
      // A previous run already opened a follow-up for SettingsScreen.
      [{ title: 'Follow-up: E2E coverage for SettingsScreen', labels: ['coverage', 'SettingsScreen'], status: 'open' }]
    )
    const result = await closePhase.run(ctx)

    expect(result.status).toBe('completed')
    const pm = ctx.adapters.projectManagement as unknown as { createTasks: jest.Mock }
    const created = pm.createTasks.mock.calls[0][0] as TaskInput[]
    // Only the screen without an existing follow-up is created.
    expect(created).toHaveLength(1)
    expect(created[0].title).toBe('Follow-up: E2E coverage for OfflineQueueScreen')
    expect(result.output).toContain('Opened 1 follow-up task(s)')
    expect(result.output).toContain('Skipped 1 screen(s) — an open follow-up already exists')
  })

  it('still opens a follow-up when the existing task for the screen is closed', async () => {
    const ctx = makeCtx(
      '### Screens & routes touched\n- SettingsScreen (no deterministic route)\n',
      projectRoot,
      // The previous follow-up was completed — the gap is open again.
      [{ title: 'Follow-up: E2E coverage for SettingsScreen', labels: ['coverage', 'SettingsScreen'], status: 'closed' }]
    )
    const result = await closePhase.run(ctx)

    expect(result.status).toBe('completed')
    const pm = ctx.adapters.projectManagement as unknown as { createTasks: jest.Mock }
    const created = pm.createTasks.mock.calls[0][0] as TaskInput[]
    expect(created).toHaveLength(1)
    expect(created[0].title).toBe('Follow-up: E2E coverage for SettingsScreen')
    expect(result.output).not.toContain('Skipped')
  })

  it('appends an entry to the coverage dashboard doc tracking E2E and a11y gaps', async () => {
    const ctx = makeCtx(
      [
        '### Screens & routes touched',
        '- SettingsScreen (no deterministic route)',
        '- Home (initial route)',
        '',
        '### E2E flows to run',
        '- `.maestro/home-accessibility.yaml` (_mobile_) → Home (accessibility)',
        '',
      ].join('\n'),
      projectRoot
    )
    const result = await closePhase.run(ctx)

    expect(result.status).toBe('completed')
    const docPath = join(projectRoot, 'docs', 'vectalon', 'coverage', 'coverage-gaps.md')
    expect(existsSync(docPath)).toBe(true)
    expect(result.output).toContain('Coverage dashboard updated: `docs/vectalon/coverage/coverage-gaps.md`')

    const doc = readFileSync(docPath, 'utf-8')
    // E2E gap with its follow-up task id.
    expect(doc).toContain('## ')
    expect(doc).toContain('SettingsScreen')
    expect(doc).toContain('follow-up `followup-1` opened')
    // a11y gaps: Home has an accessibility flow, SettingsScreen does not.
    expect(doc).toContain('### Accessibility coverage gaps')
    expect(doc).toContain('- SettingsScreen')
    expect(doc).not.toContain('- Home\n')
  })

  it('appends a second run entry without losing the first (gaps over time)', async () => {
    const report = '### Screens & routes touched\n- SettingsScreen (no deterministic route)\n'
    await closePhase.run(makeCtx(report, projectRoot))
    const second = await closePhase.run(makeCtx(report, projectRoot))

    expect(second.status).toBe('completed')
    const doc = readFileSync(join(projectRoot, 'docs', 'vectalon', 'coverage', 'coverage-gaps.md'), 'utf-8')
    // Both dated entries are present.
    expect(doc.match(/^## /gm)).toHaveLength(2)
  })
})
