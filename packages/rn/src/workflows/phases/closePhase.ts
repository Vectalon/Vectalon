import { relative } from 'path'
import type { Task, TaskInput, WorkflowPhase } from '../../adapters/types'
import { phaseResult, failedPhase } from './helpers'
import { summarizeImpactReport, impactReportFromContext } from '../../harness/impact'
import { appendCoverageGapEntry } from '../../harness/coverageDashboard'

/**
 * Screens the impact stage flagged as uncovered: annotated with "no
 * deterministic route" (no deep-link registration, no initial-route path), so
 * the test stage could not generate an impact regression flow for them.
 * Unannotated screens (legacy or hand-written reports) keep the pragmatic
 * default and are not considered flagged.
 */
function uncoveredImpactScreens(impact: {
  screens: string[]
  screenReachability: Record<string, { deepLinkable: boolean; isInitial: boolean }>
}): string[] {
  return impact.screens.filter(screen => {
    const reach = impact.screenReachability[screen]
    return reach !== undefined && !reach.deepLinkable && !reach.isInitial
  })
}

export const closePhase: WorkflowPhase = {
  id: 'close',
  name: 'Close feature board',
  description: 'Mark project management tasks as complete for the feature and open follow-ups for impact screens with no E2E coverage.',
  run: async (ctx) => {
    const taskPhase = ctx.state.phases.find(p => p.id === 'tasks')
    const ids = taskPhase?.artifacts
      .flatMap(a => {
        const matches = a.content.match(/console-task-\d+/g)
        return matches || []
      })
      .filter(Boolean) || []

    try {
      await ctx.adapters.projectManagement.closeTasks(ids)

      // Follow-ups: screens the impact stage flagged with no deterministic
      // route never got an impact regression flow — track the coverage gap as
      // open work after this feature lands instead of dropping it silently.
      const impact = summarizeImpactReport(impactReportFromContext(ctx))
      const uncovered = uncoveredImpactScreens(impact)
      const followUps: TaskInput[] = []
      const followUpScreens: string[] = []
      let duplicatesSkipped = 0
      for (const screen of uncovered) {
        // Deduplicate: a previous run may have left an open follow-up for this
        // screen in the PM provider — don't open a second one. Best-effort:
        // providers without a query API return nothing and the task is created.
        const existing =
          (await ctx.adapters.projectManagement.findTasks?.({ title: screen, labels: [screen] })) || []
        if (existing.some(task => task.status !== 'closed')) {
          duplicatesSkipped++
          continue
        }
        followUpScreens.push(screen)
        followUps.push({
          title: `Follow-up: E2E coverage for ${screen}`,
          description: `Impact analysis flagged ${screen} as having no deterministic route (no deep-link registration, no initial-route path), so no impact regression flow was generated for it. Add a deep-link registration or write a manual navigation flow in .maestro/ so future changes to this screen are covered end-to-end.`,
          type: 'qa',
          // Board filters: the coverage gap is filterable, and the screen name
          // groups follow-ups per affected screen.
          labels: ['coverage', screen],
        })
      }
      let followUpTasks: Task[] = []
      if (followUps.length > 0) {
        followUpTasks = await ctx.adapters.projectManagement.createTasks(followUps)
      }
      const followUpByScreen = new Map<string, { id: string; url?: string }>()
      followUpTasks.forEach((task, index) => followUpByScreen.set(followUpScreens[index], { id: task.id, url: task.url }))
      const e2eGaps = uncovered.map(screen => {
        const followUp = followUpByScreen.get(screen)
        return { screen, followUpTaskId: followUp?.id, followUpTaskUrl: followUp?.url }
      })
      // a11y gaps: affected screens no existing accessibility flow covers.
      const a11yGaps = impact.screens.filter(screen => impact.screenAccessibility[screen] !== true)

      // Coverage dashboard: append the dated entry so the team can track E2E
      // and accessibility gaps over time. Best-effort — never gates the run.
      let dashboardPath: string | null = null
      if (e2eGaps.length > 0 || a11yGaps.length > 0) {
        dashboardPath = appendCoverageGapEntry(ctx.projectRoot, {
          date: new Date().toISOString().slice(0, 10),
          workflowId: ctx.state.workflowId,
          runId: ctx.state.id,
          prompt: ctx.prompt,
          e2eGaps,
          a11yGaps,
        })
      }

      const output = [
        ids.length > 0
          ? `Closed ${ids.length} task(s) in ${ctx.adapters.projectManagement.name}: ${ids.join(', ')}`
          : `No tracked tasks to close in ${ctx.adapters.projectManagement.name}`,
        ...(followUpTasks.length > 0
          ? [
              '',
              `Opened ${followUpTasks.length} follow-up task(s) for impact screens with no deterministic route:`,
              '',
              ...followUpTasks.map(t => `- ${t.id}: ${t.title} (${t.status})`),
            ]
          : []),
        ...(duplicatesSkipped > 0
          ? ['', `Skipped ${duplicatesSkipped} screen(s) — an open follow-up already exists in ${ctx.adapters.projectManagement.name}.`]
          : []),
        ...(dashboardPath
          ? ['', `Coverage dashboard updated: \`${relative(ctx.projectRoot, dashboardPath)}\``]
          : []),
      ].join('\n')

      return phaseResult(
        'close',
        'Close feature board',
        'Mark project management tasks as complete for the feature and open follow-ups for impact screens with no E2E coverage.',
        output,
        [{ type: 'operations', title: `Close: ${ctx.prompt}`, content: output }]
      )
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return failedPhase('close', 'Close feature board', 'Mark project management tasks as complete for the feature.', message)
    }
  },
}
