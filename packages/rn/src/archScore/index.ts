/**
 * vectalon arch-score — Mobile Architecture Scorecard (Roadmap Phase 9,
 * item 072) — Business Source License 1.1 (BSL-1.1)
 *
 * Computes six deterministic architecture dimensions over the module graph
 * (buildCodeGraph): cycles (a cycle is an error — hard penalty), layering
 * (shared code importing feature code), coupling (average fan-out),
 * module size (files per module dir), testability (test files per module),
 * and nesting depth. Reports to docs/vectalon/arch-score/ (gitignored).
 */

import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { buildCodeGraph } from '../harness/CodeGraph'
import type { ArchScoreOptions, ArchScoreReport, ScoreDimension } from './types'

export type { ArchScoreOptions, ArchScoreReport, ScoreDimension } from './types'

/** Run one architecture scorecard (alias for the CLI/dashboard surface). */
export const runArchScore = scoreArchitecture

/** Where arch-score reports are written. */
export const archScoreDocsDir = (root: string): string => join(root, 'docs', 'vectalon', 'arch-score')

const SHARED_DIRS = new Set(['utils', 'components', 'api', 'hooks', 'lib', 'shared', 'common', 'constants', 'types', 'navigation'])
const FEATURE_DIRS = new Set(['screens', 'features', 'pages', 'modules', 'services'])

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

function gradeOf(score: number): string {
  if (score >= 90) return 'A'
  if (score >= 80) return 'B'
  if (score >= 70) return 'C'
  if (score >= 60) return 'D'
  return 'F'
}

export function verdictOf(total: number): ArchScoreReport['verdict'] {
  if (total >= 85) return 'approved'
  if (total >= 70) return 'needs-attention'
  return 'changes-requested'
}

function moduleDir(path: string): string {
  const parts = path.split('/')
  return parts.length > 1 ? parts[parts.length - 2] : '.'
}

/** Score the module graph across all six dimensions. */
export function scoreArchitecture(root: string, options: ArchScoreOptions = {}): ArchScoreReport {
  const scoredAt = Date.now()
  const srcDir = options.srcDir ?? 'src'
  const graph = buildCodeGraph(root, srcDir)
  const dimensions: ScoreDimension[] = []
  const improvements: string[] = []

  // 1. Cycles — each cycle is a structural defect (hard penalty).
  {
    const cycles = graph.cycles.length
    const score = clamp(100 - cycles * 30, 0, 100)
    dimensions.push({
      id: 'cycles', label: 'Circular dependencies', score, weight: 0.3,
      detail: cycles === 0 ? 'No cycles detected' : `${cycles} cycle(s) in the module graph`,
    })
    if (cycles > 0) improvements.push(`Break the ${cycles} circular import(s) — extract shared state or invert the dependency.`)
  }

  // 2. Layering — shared code must not import feature code.
  {
    let violations = 0
    for (const edge of graph.edges) {
      if (edge.type !== 'import') continue
      const fromDir = moduleDir(edge.from)
      const toDir = moduleDir(edge.to)
      if (SHARED_DIRS.has(fromDir) && FEATURE_DIRS.has(toDir)) violations++
    }
    const score = clamp(100 - violations * 20, 0, 100)
    dimensions.push({
      id: 'layering', label: 'Layer boundaries', score, weight: 0.2,
      detail: violations === 0 ? 'Shared code never imports feature code' : `${violations} shared→feature import(s)`,
    })
    if (violations > 0) improvements.push(`Move the ${violations} shared→feature import(s): features depend on shared, never the reverse.`)
  }

  // 3. Coupling — average fan-out per module; > 4 siblings is a smell.
  {
    const fileNodes = graph.nodes.filter(n => n.type === 'file')
    const fanOut = new Map<string, number>()
    for (const edge of graph.edges) {
      if (edge.type !== 'import') continue
      fanOut.set(edge.from, (fanOut.get(edge.from) ?? 0) + 1)
    }
    const counts = fileNodes.map(n => fanOut.get(n.id) ?? 0)
    const avg = counts.length > 0 ? counts.reduce((a, b) => a + b, 0) / counts.length : 0
    const score = clamp(Math.round(100 - Math.max(0, avg - 3) * 12), 0, 100)
    dimensions.push({
      id: 'coupling', label: 'Module coupling', score, weight: 0.15,
      detail: `avg ${avg.toFixed(1)} imports per module (${counts.length} modules)`,
    })
    if (avg > 4) improvements.push(`Average fan-out is ${avg.toFixed(1)} — prefer facade modules or barrel exports to thin the import surface.`)
  }

  // 4. Module size — many files per module dir hurts cohesion.
  {
    const byDir = new Map<string, number>()
    for (const node of graph.nodes) {
      if (node.type !== 'file') continue
      const dir = moduleDir(node.id)
      byDir.set(dir, (byDir.get(dir) ?? 0) + 1)
    }
    const sizes = [...byDir.values()]
    const max = sizes.length > 0 ? Math.max(...sizes) : 0
    const score = clamp(100 - Math.max(0, max - 10) * 4, 0, 100)
    dimensions.push({
      id: 'module-size', label: 'Module cohesion', score, weight: 0.15,
      detail: `largest module has ${max} file(s) across ${byDir.size} module(s)`,
    })
    if (max > 15) improvements.push(`The largest module dir has ${max} files — split it by responsibility.`)
  }

  // 5. Testability — modules without tests.
  {
    let testable = 0
    let total = 0
    for (const node of graph.nodes) {
      if (node.type !== 'file') continue
      total++
      if (node.path.includes('__tests__') || /\.(test|spec)\./.test(node.path)) testable++
    }
    const pct = total > 0 ? (testable / total) * 100 : 0
    const score = clamp(Math.round(pct), 0, 100)
    dimensions.push({
      id: 'testability', label: 'Test coverage presence', score, weight: 0.1,
      detail: `${testable} of ${total} source files have a test sibling (${pct.toFixed(0)}%)`,
    })
    if (pct < 50) improvements.push(`Only ${pct.toFixed(0)}% of source files have tests — add at least one test per module.`)
  }

  // 6. Nesting depth — deep src trees add navigation cost.
  {
    const depths = graph.nodes.filter(n => n.type === 'file').map(n => n.id.split('/').length)
    const maxDepth = depths.length > 0 ? Math.max(...depths) : 0
    const score = clamp(100 - Math.max(0, maxDepth - 5) * 15, 0, 100)
    dimensions.push({
      id: 'depth', label: 'Nesting depth', score, weight: 0.1,
      detail: `deepest file sits ${maxDepth} levels under ${srcDir}/`,
    })
    if (maxDepth > 6) improvements.push(`The deepest files sit ${maxDepth} levels deep — flatten the tree with feature folders.`)
  }

  const total = Math.round(dimensions.reduce((acc, d) => acc + d.score * d.weight, 0))
  return {
    scoredAt,
    root,
    dimensions,
    total,
    grade: gradeOf(total),
    verdict: verdictOf(total),
    topImprovements: improvements.slice(0, 5),
  }
}

/** Render the scorecard as markdown. */
export function renderArchScoreMarkdown(report: ArchScoreReport): string {
  const lines = ['# vectalon arch-score — Mobile Architecture Scorecard', '']
  lines.push(`**${report.total}/100 — grade ${report.grade} (${report.verdict})**`, '', '| Dimension | Score | Weight | Detail |', '|---|---|---|---|')
  for (const d of report.dimensions) lines.push(`| ${d.label} | ${d.score} | ${Math.round(d.weight * 100)}% | ${d.detail} |`)
  lines.push('', '## Top improvements', '')
  if (report.topImprovements.length === 0) lines.push('- None — keep the architecture healthy.')
  for (const i of report.topImprovements) lines.push(`- ${i}`)
  return lines.join('\n')
}

/** Write the markdown + JSON report. */
export function writeArchScoreReport(root: string, report: ArchScoreReport): { mdPath: string; jsonPath: string } {
  const dir = archScoreDocsDir(root)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const md = renderArchScoreMarkdown(report)
  const json = JSON.stringify(report, null, 2)
  const mdPath = join(dir, 'report.md')
  const jsonPath = join(dir, 'report.json')
  writeFileSync(mdPath, md, 'utf-8')
  writeFileSync(jsonPath, json, 'utf-8')
  return { mdPath, jsonPath }
}
