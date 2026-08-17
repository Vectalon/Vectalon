/**
 * vectalon rnbench — the competitor protocol + export bundle.
 * Business Source License 1.1 (BSL-1.1)
 *
 * The benchmark competitors can't easily copy because the material is
 * published: every scenario ships with its fixture project, its human
 * reference, and the rubric. `vc rnbench --export <dir>` writes the exact
 * bundle a team runs any tool (Claude Code, Cursor, Cline, Windsurf, Aider,
 * a generic LLM) through — same prompt, same fixtures, same scoring.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { dimensionOf, SCENARIO_DIMENSION } from './dimensions'
import { BENCH_VERSION } from './index'

export const PROTOCOL = `# Vectalon RN Engineering Benchmark — competitor protocol

Run any coding tool against the same task set, score it with the same rubric,
and the result is directly comparable to the published leaderboard.

## 1. Setup

For each scenario in \`scenarios/\`:

1. Create a fresh project from the scenario's \`fixtures/\` (a real RN app
   skeleton — package.json, tsconfig, app entry, tests).
2. Give the tool the scenario's \`prompt\` exactly as written.
3. Let it write its answer into the project (no manual edits after).

## 2. Scoring

Score the tool's output with the same rubric the leaderboard uses:

- \`packages/rn/src/bench/rubric.ts\` — \`runRubric(files, opts)\` over the
  generated files (correctness = typecheck + lint + tests actually run;
  adherence = the RN-specific craft checklist; guardrails = the bans).
- The scenario's \`expect.files\` / \`expect.behaviors\` define correctness.
- Compare against the human \`reference/\` for the relative score.

## 3. Reporting

Drop the result into \`bench/competitors/results/<tool>.json\`:

\`\`\`json
{
  "tool": "claude-code",
  "version": "…",
  "date": "…",
  "runs": [
    { "id": "rn-01-login-screen", "composite": 0.81, "axes": { "correctness": 0.75, "adherence": 0.8, "guardrails": 0.9 } }
  ]
}
\`\`\`

The leaderboard (\`vc rnbench\`) renders any committed result row.

## 4. Rules

- Same fixtures, same prompts, same rubric — no exceptions.
- Correctness is scored live (typecheck + lint + tests), never assumed.
- A scenario a tool cannot complete scores what it produced — there is no
  skip-and-keep-best.
`

/** Scenario short id → the fixture + reference + prompt for one task. */
export interface RnnTaskBundle {
  id: string
  title: string
  suite: string
  dimension: string
  prompt: string
  fixtures: Record<string, string>
  reference: Record<string, string>
}

function readJson<T>(p: string): T {
  return JSON.parse(readFileSync(p, 'utf-8')) as T
}

/** Load every task bundle from the committed scenarios + references. */
export function loadTaskBundles(benchDir: string): RnnTaskBundle[] {
  const scenariosDir = join(benchDir, 'scenarios')
  const referencesDir = join(benchDir, 'references')
  if (!existsSync(scenariosDir) || !existsSync(referencesDir)) return []
  const out: RnnTaskBundle[] = []
  for (const file of readdirSync(scenariosDir).filter(f => f.endsWith('.json')).sort()) {
    const s = readJson<{ id: string; title: string; suite: string; prompt: string; fixtures: Record<string, string> }>(join(scenariosDir, file))
    const refFile = join(referencesDir, file)
    const reference = existsSync(refFile) ? readJson<{ files: Array<{ path: string; content: string }> }>(refFile) : null
    const refMap: Record<string, string> = {}
    for (const f of reference?.files ?? []) refMap[f.path] = f.content
    out.push({
      id: s.id,
      title: s.title,
      suite: s.suite,
      dimension: dimensionOf(s.id) ?? 'unmapped',
      prompt: s.prompt,
      fixtures: s.fixtures ?? {},
      reference: refMap,
    })
  }
  return out
}

/** Write the full export bundle (tasks + protocol) to a directory. */
export function writeCompetitorBundle(benchDir: string, outDir: string): { count: number; outDir: string } {
  const tasks = loadTaskBundles(benchDir)
  mkdirSync(join(outDir, 'scenarios'), { recursive: true })
  mkdirSync(join(outDir, 'protocol'), { recursive: true })
  for (const t of tasks) {
    writeFileSync(join(outDir, 'scenarios', `${t.id}.json`), JSON.stringify(t, null, 2) + '\n')
  }
  writeFileSync(join(outDir, 'protocol', 'PROTOCOL.md'), PROTOCOL)
  writeFileSync(
    join(outDir, 'MANIFEST.json'),
    JSON.stringify({ version: BENCH_VERSION, exportedAt: new Date().toISOString(), count: tasks.length, dimensions: Object.entries(SCENARIO_DIMENSION) }, null, 2) + '\n'
  )
  return { count: tasks.length, outDir }
}
