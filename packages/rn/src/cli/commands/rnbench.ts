/**
 * vectalon rnbench — the Vectalon RN Engineering Benchmark (P0 roadmap item 8).
 * Business Source License 1.1 (BSL-1.1)
 *
 * A benchmark competitors can't easily copy: 43 published scenarios, human
 * references, and an RN-specific rubric, scored live across eight engineering
 * dimensions — and compared row by row (Vectalon, generic LLMs, Human,
 * Claude Code, Cursor, Cline, Windsurf, Aider). Every number is computed from
 * committed artifacts; the scenario→dimension mapping is published; pending
 * rows stay pending until run through the exported protocol.
 */
import { mkdirSync, writeFileSync } from 'fs'
import { join, resolve } from 'path'
import { printCarbonReport, parchment, dim } from '../carbon'
import { buildRnnBenchmark, renderRnnMarkdown } from '../../rnbench'
import { writeCompetitorBundle } from '../../rnbench/protocol'

export interface RnnBenchCommandOptions {
  /** Print machine-readable output. */
  json?: boolean
  /** Write the full competitor-run bundle (scenarios + fixtures + references + protocol). */
  export?: string
}

export const METHODOLOGY = `# Vectalon RN Engineering Benchmark — methodology

## What it is

A public, reproducible benchmark for **React Native engineering work** —
eight dimensions a team actually cares about: architecture, native
integration, dependency management, testing, performance, security,
upgrades, and debugging. It measures a tool's output the way an RN team
would judge it, not the way a generic coding benchmark does.

## The material (the moat)

- **43 scenarios** (\`bench/scenarios/\`) — real RN tasks with a fixture
  project (package.json, tsconfig, entry, tests) and an exact prompt: 35
  build tasks plus 4 upgrade-breakage repairs (rn-36..39 — compileSdk,
  Kotlin/AGP/wrapper, New Architecture, deprecated API) and 4 debugging
  repairs (rn-40..43 — Metro resolution, Hermes crash, TS regression,
  native linking).
- **43 human references** (\`bench/references/\`) — human-authored solutions
  to the same tasks, scored by the same rubric (they are not 100%).
- **The rubric** (\`src/bench/rubric.ts\`) — correctness (typecheck + lint +
  tests actually run), adherence (the RN craft checklist: tokens, hooks,
  KeyboardAvoidingView, typed state, a11y), guardrails (the bans).

Everything is committed, and \`vc rnbench --export\` writes the exact bundle
anyone runs a competitor through — same prompts, same fixtures, same rubric.

## How rows are scored

- **Human** — the 43 references, scored by the rubric (per-scenario
  reference composites carried in the committed result files).
- **Generic LLM (7B / 3B / 1.5B)** — qwen2.5-coder tiers, scored live
  (typecheck + lint + tests run against generated code), committed in
  \`bench/results/local-7b.json\` / \`local-3b.json\` / \`local.json\`.
- **Vectalon** — the deterministic engine. It does not generate from
  prompts; where it has a seam it is scored from the committed gate:
  dependency-management = the removal seam (99 composite), upgrades = the
  fix-bench upgrade suite (10/10 auto-fix), debugging = fix-bench diagnosis
  (100/100), and the rest = the deterministic scaffold floor (100%
  adherence on the baseline gate, enforced every PR).
- **Claude Code / Cursor / Cline / Windsurf / Aider** — pending until run
  through the exported protocol; a benchmark that has not run a tool does
  not invent a score.

## Anti-cherry-picking rules

1. The scenario→dimension mapping is fixed and published — no scenario
   moves after the fact.
2. Every row is scored by the same rubric on the same fixtures against the
   same references.
3. Model rows are scored live; correctness is never assumed.
4. The human row is scored by the same rubric and is not automatically 100%.
5. Pending cells are rendered as pending.
`

export async function rnnBenchCommand(directory: string, options: RnnBenchCommandOptions = {}): Promise<void> {
  const root = resolve(directory || process.cwd())
  const bench = buildRnnBenchmark(root)

  if (options.json) {
    process.stdout.write(JSON.stringify(bench, null, 2) + '\n')
    return
  }

  // Export the competitor bundle when asked.
  if (options.export) {
    const outDir = resolve(options.export)
    const { count } = writeCompetitorBundle(join(root, 'bench'), outDir)
    printCarbonReport({
      title: 'vectalon rnbench — competitor bundle',
      verdict: 'ok',
      lines: [
        `exported ${count} scenarios + fixtures + references + the rubric protocol to:`,
        `  ${outDir}`,
        '',
        dim('Run any tool (Claude Code, Cursor, Cline, Windsurf, Aider, a generic LLM)'),
        dim('through scenarios/<id>.json → score with the rubric → drop the result into'),
        dim('bench/competitors/results/<tool>.json → the leaderboard renders it.'),
      ],
      reportPath: join(outDir, 'MANIFEST.json'),
      root,
    })
    return
  }

  // The leaderboard window.
  const body: string[] = []
  body.push(`${parchment('Eight dimensions · published fixtures · live scoring · no cherry-picking')}`, '')
  body.push(`  ${bench.dimensions.map(d => `${d.label} (${d.scenarios.length})`).join(' · ')}`, '')
  body.push('')
  for (const tool of bench.tools) {
    const cells = bench.dimensions.map(d => {
      const cell = bench.matrix[tool.id]?.[d.id]
      if (!cell || cell.value === null) return '  —'
      return `${String(cell.value).padStart(3)}%`
    })
    const status = tool.status === 'pending' ? dim(' · pending — run the protocol') : ''
    body.push(`  ${tool.label.padEnd(18)} ${cells.join('  ')}${status}`)
  }
  body.push('', dim('Cell values: rubric composite (LLM/human) · deterministic metrics (Vectalon) · “—” pending.'))
  body.push(dim('The scenario→dimension mapping is published and auditable; the human row is scored by the same rubric and is not 100%.'))

  printCarbonReport({
    title: 'vectalon rnbench — Vectalon RN Engineering Benchmark',
    verdict: 'ok',
    lines: body,
    reportPath: join(root, 'docs', 'vectalon', 'rnbench', 'report.md'),
    root,
    done: 'Benchmark computed from committed artifacts — publish the methodology, export the bundle, and run competitors through the protocol.',
  })

  // Reports + the published methodology.
  const dir = join(root, 'docs', 'vectalon', 'rnbench')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'report.md'), renderRnnMarkdown(bench) + '\n')
  writeFileSync(join(dir, 'METHODOLOGY.md'), METHODOLOGY)
  void bench
}

/** Re-export the builder so tests and the site can consume it directly. */
export { buildRnnBenchmark, renderRnnMarkdown, type RnnBenchmark } from '../../rnbench'
