/**
 * vc demo — the flagship demonstration: the feature workflow, live.
 * Business Source License 1.1 (BSL-1.1)
 *
 * The most impressive thing in the repo, as a hero surface. "Build a Login
 * feature." → Vectalon produces Requirement → Architecture decision →
 * Affected files → Implementation plan → Code → Tests → Review → Build
 * verification → PR. Deterministic and offline: when a prior workflow run
 * exists under docs/vectalon/feature-development/, its real phases and
 * artifacts are shown; otherwise the canonical 14-stage pipeline and the
 * self-healing loop are rendered. Zero model calls — this is the
 * demonstration, not a live run (run `vc feature "<prompt>"` for that).
 */
import { existsSync, readdirSync, readFileSync } from 'fs'
import { join, resolve } from 'path'
import pc from 'picocolors'
import { printCarbonReport, parchment, dim } from '../carbon'

export interface DemoCommandOptions {
  /** Print machine-readable output. */
  json?: boolean
}

/** The canonical 14-stage pipeline (the hero story). */
export const PIPELINE: Array<{ id: string; label: string; product: string }> = [
  { id: 'prd', label: 'Requirement', product: 'PRD — what we build and why' },
  { id: 'scope', label: 'Scope', product: 'In/out-of-scope + impact' },
  { id: 'impact', label: 'Affected files', product: 'Blast radius across screens, navigation, tests' },
  { id: 'design', label: 'Design', product: 'UX spec, states, a11y' },
  { id: 'architecture', label: 'Architecture decision', product: 'ADR — modules, API, state, native' },
  { id: 'tasks', label: 'Implementation plan', product: 'Task breakdown with dependencies' },
  { id: 'tests', label: 'Tests', product: 'TDD tests written first' },
  { id: 'implementation', label: 'Code', product: 'The feature, compile-gated' },
  { id: 'code-review', label: 'Review', product: 'Self-review against standards' },
  { id: 'verification', label: 'Build verification', product: 'tsc + jest + lint, real checks' },
  { id: 'readiness', label: 'Readiness', product: 'Release-ready gate' },
  { id: 'pr', label: 'PR', product: 'Branch + pull request' },
  { id: 'documentation', label: 'Documentation', product: 'Docs updated' },
  { id: 'close', label: 'Close', product: 'Board closed, follow-ups filed' },
]

/** The self-healing loop — shown when verification/readiness fails. */
export const HEAL_LOOP: Array<{ label: string; detail: string }> = [
  { label: 'Build failed', detail: 'verification or readiness fails' },
  { label: 'diagnose', detail: 'failure facts extracted from the report' },
  { label: 'modify', detail: 'implementation regenerates with the failure context' },
  { label: 'rebuild', detail: 'the failing stage is retried' },
  { label: 'verify', detail: 'loop repeats until the gate passes or attempts run out' },
]

export interface PriorRun {
  id: string
  prompt: string
  status: string
  phases: Array<{ id: string; name: string; status: string }>
  files: string[]
  createdAt?: number
}

/** Find the most recent workflow run under docs/vectalon/feature-development/. */
export function findPriorRun(root: string): PriorRun | null {
  const dir = join(root, 'docs', 'vectalon', 'feature-development')
  if (!existsSync(dir)) return null
  let entries: string[]
  try {
    entries = readdirSync(dir).filter(e => e !== 'index.md')
  } catch {
    return null
  }
  let best: PriorRun | null = null
  let bestTime = -1
  for (const entry of entries) {
    const statePath = join(dir, entry, 'workflow-state.json')
    if (!existsSync(statePath)) continue
    try {
      const state = JSON.parse(readFileSync(statePath, 'utf-8')) as {
        id?: string; prompt?: string; status?: string; createdAt?: number; phases?: Array<{ id: string; name: string; status: string; artifacts?: Array<{ type?: string; path?: string }> }>
      }
      const time = state.createdAt ?? 0
      if (time < bestTime) continue
      bestTime = time
      best = {
        id: state.id ?? entry,
        prompt: state.prompt ?? entry,
        status: state.status ?? 'unknown',
        phases: (state.phases ?? []).map(p => ({ id: p.id, name: p.name, status: p.status })),
        files: (state.phases ?? [])
          .flatMap(p => (p.artifacts ?? []))
          .filter(a => a.type !== 'document' && a.path)
          .map(a => a.path as string),
        createdAt: state.createdAt,
      }
    } catch {
      // Skip corrupt states; keep looking.
    }
  }
  return best
}

/** Render the pipeline as the hero block — numbered, marked, with the product. */
export function renderPipeline(run: PriorRun | null): string[] {
  const lines: string[] = []
  lines.push(parchment(`vectalon feature "Build a Login feature."`))
  lines.push('')
  const statusMap = new Map((run?.phases ?? []).map(p => [p.id, p.status]))
  PIPELINE.forEach((stage, i) => {
    const st = statusMap.get(stage.id)
    const mark = st === 'completed' ? pc.green('✓') : st ? pc.yellow('→') : pc.dim('·')
    const num = pc.dim(String(i + 1).padStart(2))
    const label = st === 'completed' ? stage.label : st ? pc.bold(stage.label) : stage.label
    lines.push(`  ${mark} ${num} ${label.padEnd(22)} ${dim(stage.product)}`)
  })
  return lines
}

/** Render the self-healing loop as a compact cycle. */
export function renderHealLoop(): string[] {
  const lines: string[] = []
  lines.push(pc.bold('Self-healing loop — when a gate fails:'))
  lines.push('')
  const cycle = HEAL_LOOP.map(h => `${pc.yellow(h.label)}`).join(' → ')
  lines.push(`  ${cycle}`)
  lines.push('')
  for (const h of HEAL_LOOP) {
    lines.push(`  ${dim('·')} ${pc.bold(h.label)} — ${h.detail}`)
  }
  return lines
}

export async function demoCommand(options: DemoCommandOptions): Promise<void> {
  const root = resolve(process.cwd())
  const run = findPriorRun(root)

  if (options.json) {
    process.stdout.write(JSON.stringify({ pipeline: PIPELINE, healLoop: HEAL_LOOP, priorRun: run }, null, 2) + '\n')
    return
  }

  const body: string[] = []
  body.push(...renderPipeline(run))
  if (run) {
    body.push('')
    body.push(dim(`From a real run: "${run.prompt}" — ${run.phases.filter(p => p.status === 'completed').length}/${run.phases.length} stages completed · ${run.files.length} files written`))
    if (run.files.length > 0) {
      for (const f of run.files.slice(0, 6)) {
        const rel = f.startsWith(root) ? f.slice(root.length + 1) : f
        body.push(`  ${pc.green('✔')} ${rel}`)
      }
      if (run.files.length > 6) body.push(`  ${dim(`… +${run.files.length - 6} more`)}`)
    }
  }
  body.push('')
  body.push(...renderHealLoop())

  const verdict = run?.status === 'completed' ? 'approved' : 'needs-attention'
  printCarbonReport({
    title: 'vectalon demo — the flagship feature workflow',
    verdict,
    lines: body,
    reportPath: join(root, 'docs', 'vectalon', 'demo', 'report.txt'),
    root,
    footer: run ? 'real prior run · zero model calls' : 'canonical pipeline · run vc feature "<prompt>" to see it live',
    done: run
      ? `Workflow demo ready — ${run.prompt} (${run.phases.filter(p => p.status === 'completed').length} of ${run.phases.length} stages).`
      : 'Workflow demo ready — run `vc feature "Build a Login feature."` to see the full pipeline live.',
  })
}

