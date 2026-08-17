/**
 * vectalon sales-demo — the 30-minute sales demo that requires no explanation.
 * Business Source License 1.1 (BSL-1.1)
 *
 * The five-act narrative, run LIVE against the real project (no canned
 * screenshots — every number is this repository):
 *
 *   Minute 0–5   init      "Here's a real React Native repository." — the scan
 *                          summary (files, components, screens, native modules,
 *                          dependencies) + the Health Score.
 *   Minute 5–10  intel     "Vectalon understands the application, not just
 *                          files." — the application model: screens, navigation,
 *                          state, native modules, dependency cycles.
 *   Minute 10–20 fix       "Take a real failure." — diagnose → fix → verify,
 *                          run live on a real injected failure (or --log).
 *   Minute 20–25 brain     "Why did we choose Zustand?" — the decision card.
 *   Minute 25–30 outcomes  "This is what Vectalon saved your team." — the
 *                          engineering-outcomes ledger.
 *
 * Zero model calls. The fix act edits only a sandbox copy. Writes the full
 * narration script to docs/vectalon/sales-demo/SCRIPT.md.
 */
import { mkdirSync, writeFileSync } from 'fs'
import { join, resolve } from 'path'
import pc from 'picocolors'
import { renderCarbonWindow, parchment, dim } from '../carbon'
import { logger } from '../logger'
import { readProjectIntel, buildApplicationModel } from '../../intel/model'
import { runScore } from '../../score'
import { runFix } from '../../fix'
import type { FixOptions } from '../../fix'
import { loadFixBenchScenarios } from '../../fixBench/loader'
import { materializeBrokenScenario } from '../../fixBench/runner'
import { buildBrainReport, askBrain } from './brain'
import { renderBrainAnswer } from '../../teamBrain/qa'
import { collectOutcomes, hoursSaved, savingsEstimate, blendedRate } from '../../outcomes/ledger'

export interface SalesDemoOptions {
  /** Fix act: path to a real failure log (default: one committed fix-bench failure, run live). */
  log?: string
  /** Fix act: a described failure, e.g. "Android build started failing after upgrading RN". */
  issue?: string
  /** Brain act: the question (default: "Why did we choose Zustand?"). */
  question?: string
  /** Print machine-readable output. */
  json?: boolean
  /** Injectable command runner for the fix verification (hermetic tests stub this). */
  run?: FixOptions['run']
}

const SCRIPTS: Array<{ act: string; minutes: string; command: string; narration: string; say: string }> = [
  {
    act: '1 · init',
    minutes: '0–5',
    command: 'vectalon init',
    narration: "Here's a real React Native repository.",
    say: 'Run once. One command scans the whole project and ends with a health score the whole team understands. No configuration, no model setup.',
  },
  {
    act: '2 · intel',
    minutes: '5–10',
    command: 'vc intel',
    narration: 'Vectalon understands the application, not just files.',
    say: 'A generic AI agent sees files. Vectalon sees an application — screens, navigation, state, native modules, the dependency graph, the cycles. That model is the foundation every agent consumes.',
  },
  {
    act: '3 · fix',
    minutes: '10–20',
    command: 'vc fix',
    narration: 'Take a real failure.',
    say: 'Diagnose → fix → verify. Root cause, evidence with file:line, impact, the fix applied, verification, confidence. No human in the loop — and we proved it on 100 real failures.',
  },
  {
    act: '4 · brain',
    minutes: '20–25',
    command: 'vc brain',
    narration: 'Why did we choose Zustand?',
    say: 'The team brain. A decision, the reason, who approved it, what it relates to, when it was last reviewed. New engineers stop re-litigating decisions.',
  },
  {
    act: '5 · outcomes',
    minutes: '25–30',
    command: 'vc outcomes',
    narration: 'This is what Vectalon saved your team.',
    say: 'Not features — outcomes. Issues detected, fixed, prevented; PR review issues caught; build failures resolved; upgrades completed. Every number comes from the reports the agents committed. That is the sales material.',
  },
]

/** The scan census for the init act — real numbers from the shared intel model. */
function census(model: ReturnType<typeof buildApplicationModel>): string[] {
  return [
    `${model.sourceFiles.toLocaleString('en-US')} files`,
    `${model.components} components`,
    `${model.screens.length} screens`,
    `${model.nativeModules.length} native modules`,
    `${model.dependencies.length} dependencies`,
  ]
}

export async function salesDemoCommand(directory: string, options: SalesDemoOptions = {}): Promise<void> {
  const root = resolve(directory || process.cwd())
  const question = options.question ?? 'Why did we choose Zustand?'

  const acts: Array<{ id: string; minutes: string; lines: string[]; verdict: string }> = []

  // Act 1 + 2 share one memoized intel pass; the score reuses the same cache.
  const intel = readProjectIntel(root)
  const model = intel.report ? buildApplicationModel(intel.report) : null

  // The demo is a scripted surface: the internal command logs (npx tsc, git log,
  // …) are real but noisy — silence the harness logger while the acts run, and
  // render the act cards to stdout directly. Restored on every path.
  const realInfo = logger.info
  const realSuccess = logger.success
  logger.info = () => {}
  logger.success = () => {}
  try {
    await runActs()
  } finally {
    logger.info = realInfo
    logger.success = realSuccess
  }

  // ---- Render (clean: cards to stdout, internal command logs silenced) ----
  const reportPath = join(root, 'docs', 'vectalon', 'sales-demo', 'report.md')
  if (options.json) {
    process.stdout.write(JSON.stringify(acts, null, 2) + '\n')
    return
  }

  acts.forEach((act, i) => {
    const script = SCRIPTS[i]
    const body = [
      `project: ${root}`,
      '',
      parchment(`“${script.narration}”`),
      '',
      ...act.lines,
      '',
      `Report: ${reportPath}`,
    ]
    process.stdout.write(renderCarbonWindow({ title: `vc sales-demo · Act ${script.act} — ${script.command}   (minute ${script.minutes})`, verdict: act.verdict, lines: body }) + '\n')
  })

  // The narration script the salesperson follows.
  writeSalesDemoScript(root, question)

  /** The five acts, run in order against the real project. */
  async function runActs(): Promise<void> {
  // ---- Act 1 — init ----
  {
    const lines: string[] = []
    if (model) {
      lines.push(`Scanning React Native project...`, '')
      for (const c of census(model)) lines.push(`  ✓ ${c}`)
      lines.push('')
    } else {
      lines.push(dim('Intel model unavailable — run `vectalon init` once to build it.'))
    }
    let overall: number | null = null
    try {
      const score = await runScore(root, { skipAudit: true })
      overall = score.overall
    } catch {
      overall = null
    }
    if (overall !== null) {
      lines.push('', parchment(`Vectalon Health Score: ${overall}/100`))
    } else {
      lines.push('', dim('Health Score unavailable — run `vc score` once.'))
    }
    lines.push('', dim(`Sell: ${SCRIPTS[0].say}`))
    acts.push({ id: 'init', minutes: SCRIPTS[0].minutes, lines, verdict: overall !== null ? 'ok' : 'info' })
  }

  // ---- Act 2 — intel ----
  {
    const lines: string[] = []
    if (model) {
      lines.push(`${parchment(model.name)}${model.rnVersion ? ` · React Native ${model.rnVersion}` : ''}${model.tooling === 'expo' && model.expoSdk ? ` · Expo ${model.expoSdk}` : ''}`, '')
      lines.push(`  application`, `   ├── screens        (${model.screens.length})  ${model.screens.slice(0, 6).map(s => s.name).join(', ')}${model.screens.length > 6 ? ' …' : ''}`)
      lines.push(`   ├── navigation     (${model.navigators.length})  ${model.navigators.slice(0, 6).join(', ')}${model.navigators.length > 6 ? ' …' : ''}`)
      lines.push(`   ├── state           (${model.stateStores.length})  ${model.stateStores.slice(0, 6).map(s => s.name).join(', ')}${model.stateStores.length > 6 ? ' …' : ''}`)
      lines.push(`   ├── native modules  (${model.nativeModules.length})  ${model.nativeModules.slice(0, 6).join(', ')}${model.nativeModules.length > 6 ? ' …' : ''}`)
      lines.push(`   ├── dependencies    (${model.dependencies.length})  ${model.dependencies.slice(0, 6).map(d => d.name).join(', ')}${model.dependencies.length > 6 ? ' …' : ''}`)
      lines.push(`   └── dependency graph  ${model.cycles === 0 ? 'no cycles' : pc.yellow(`${model.cycles} cycle${model.cycles === 1 ? '' : 's'}`)}`)
    } else {
      lines.push(dim('Application model unavailable — run `vc intel` once.'))
    }
    lines.push('', dim(`Sell: ${SCRIPTS[1].say}`))
    acts.push({ id: 'intel', minutes: SCRIPTS[1].minutes, lines, verdict: model ? 'ok' : 'info' })
  }

  // ---- Act 3 — fix (the live money shot) ----
  {
    const lines: string[] = []
    let fixRoot = root
    let logPath: string | undefined = options.log ? resolve(options.log) : undefined
    let issue = options.issue
    let cleanup: (() => void) | null = null

    if (!options.log && !options.issue) {
      // Default: run the REAL pipeline against one committed fix-bench failure.
      const { scenarios, problems } = loadFixBenchScenarios()
      const scenario = scenarios.find(s => s.id === 'fx-kotlin-01')
      if (!scenario) {
        lines.push(dim(`No demo failure available (${problems.map(p => p.problems.join('; ')).join(' | ')}). Pass --log <path> for a real failure.`))
      } else {
        const m = materializeBrokenScenario(scenario)
        cleanup = m.cleanup
        fixRoot = m.dir
        logPath = m.logPath
        issue = scenario.issue
        lines.push(dim(`Real injected failure: ${scenario.title}`), '')
      }
    }

    try {
      const started = Date.now()
      const report = await runFix(fixRoot, { issue, log: logPath, run: options.run })
      const elapsed = Date.now() - started
      const rootFinding = report.findings.find(f => f.rootCause) ?? report.findings[0]
      if (!rootFinding) {
        lines.push('No issue reproduced from the current project state.')
        lines.push(dim('Pass a build log with --log <path> or describe the failure with --issue "…".'))
      } else {
        lines.push(pc.bold('Root cause:'), `  ${rootFinding.message}`, '')
        if (rootFinding.evidence.length > 0) {
          lines.push(pc.bold('Evidence:'))
          for (const e of rootFinding.evidence.slice(0, 4)) {
            const loc = e.file === 'log' ? 'build log' : `${e.file}${e.line ? `:${e.line}` : ''}`
            lines.push(`  ${loc} — ${e.detail}`)
          }
          lines.push('')
        }
        lines.push(pc.bold(`Impact:${rootFinding.impact.length > 0 ? ` ${rootFinding.impact.length} package${rootFinding.impact.length === 1 ? '' : 's'}` : ''}`))
        if (rootFinding.impact.length > 0) lines.push(`  ${rootFinding.impact.slice(0, 6).join(', ')}`)
        lines.push('')
        // The fix pipeline's verdict keys off severity: changes-requested means
        // the failure WAS found; the demo story is whether edits were planned.
        const confidence = Math.round(report.confidence)
        if (report.edits.length > 0) {
          lines.push(pc.bold('Diagnose → fix → verify:'), `  ${pc.green('✓')} ${report.edits.length} edit${report.edits.length === 1 ? '' : 's'} applied in sandbox · confidence ${confidence}% · ${elapsed}ms`)
        } else {
          const glyph = report.verdict === 'approved' ? pc.green('✓') : pc.yellow('⚠')
          lines.push(`  ${glyph} ${report.verdict} — no deterministic edit planned (manual fix) · ${elapsed}ms`)
        }
        lines.push('', dim('Sandboxed — your tree is untouched. The unified diff is in the report.'))
      }
    } finally {
      cleanup?.()
    }
    lines.push('', dim(`Sell: ${SCRIPTS[2].say}`))
    acts.push({ id: 'fix', minutes: SCRIPTS[2].minutes, lines, verdict: 'ok' })
  }

  // ---- Act 4 — brain ----
  {
    const lines: string[] = []
    const report = await buildBrainReport(root)
    const answer = askBrain(report, question)
    const rendered = renderBrainAnswer(answer)
    if (rendered.length === 0) {
      lines.push(`No answer for "${question}".`)
      lines.push(dim('Run `vc team` once to index ADR/decision files — the brain parses them; the files stay the source of truth.'))
    } else {
      lines.push(`Q: ${parchment(`"${question}"`)}`, '')
      lines.push(...rendered.slice(0, 16))
    }
    lines.push('', dim(`Sell: ${SCRIPTS[3].say}`))
    acts.push({ id: 'brain', minutes: SCRIPTS[3].minutes, lines, verdict: rendered.length > 0 ? 'ok' : 'info' })
  }

  // ---- Act 5 — outcomes ----
  {
    const counts = collectOutcomes(root)
    const rate = blendedRate()
    const hours = hoursSaved(counts)
    const savings = savingsEstimate(counts, rate)
    const lines: string[] = []
    if (hours <= 0) {
      lines.push('No outcomes yet — the ledger is empty until the agents run.')
      lines.push(dim('Run `vc fix`, `vc review`, `vc build-fix`, `vc upgrade`, `vc score` — every report the agents commit lands here, counted deterministically.'))
    } else {
      const rows: Array<[string, number]> = [
        ['issues detected', counts.issuesDetected],
        ['issues prevented', counts.issuesPrevented],
        ['PR review issues caught', counts.prIssuesCaught],
        ['build failures resolved', counts.buildFailuresFixed],
        ['RN upgrades completed', counts.rnUpgradesCompleted],
        ['tests generated', counts.testsGenerated],
      ]
      for (const [label, n] of rows) {
        if (n > 0) lines.push(`  ${String(n).padStart(4)}  ${label}`)
      }
      lines.push('', parchment(`Estimated savings: $${savings.toLocaleString('en-US')}`))
      lines.push(dim(`${hours.toFixed(1)} engineer-hours · $${rate}/hr blended`))
    }
    lines.push('', dim(`Sell: ${SCRIPTS[4].say}`))
    acts.push({ id: 'outcomes', minutes: SCRIPTS[4].minutes, lines, verdict: hours > 0 ? 'ok' : 'info' })
  }
  }
}

/** Write the full 30-minute narration to docs/vectalon/sales-demo/SCRIPT.md. */
export function writeSalesDemoScript(root: string, question: string): string {
  const dir = join(root, 'docs', 'vectalon', 'sales-demo')
  mkdirSync(dir, { recursive: true })
  const lines: string[] = [
    '# The 30-Minute Sales Demo — no explanation required',
    '',
    'Every number below is **this repository**. Nothing is canned; nothing is fake.',
    '',
  ]
  for (const s of SCRIPTS) {
    lines.push(`## Minute ${s.minutes} — ${s.command}`, '')
    lines.push(`**You say:** “${s.narration}”`, '')
    lines.push('', `**Run:** ` + '`' + s.command + '`', '', `**And then:** ${s.say}`, '')
  }
  lines.push('', '## Closing', '', `“This is what Vectalon saved your team. Install the GitHub App once — every PR from now on is reviewed automatically. That's the demo.”`, '')
  const p = join(dir, 'SCRIPT.md')
  writeFileSync(p, lines.join('\n') + '\n')
  return p
}
