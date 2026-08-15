/**
 * vectalon dx — DX Scoring Agent (Roadmap Phase 11, item 100)
 * Business Source License 1.1 (BSL-1.1)
 *
 * One developer-experience score (0-100) from local evidence: docs, CI,
 * tests, lint, type strictness, onboarding, and source complexity.
 * Reports to docs/vectalon/dx/ (gitignored).
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'fs'
import { join } from 'path'
import { collectSourceFiles } from '../intel/dependencyGraph'
import type { DxAxis, DxReport, DxVerdict } from './types'

export type { DxAxis, DxReport, DxVerdict } from './types'

/** Where dx reports are written. */
export const dxDocsDir = (root: string): string => join(root, 'docs', 'vectalon', 'dx')

const has = (root: string, rel: string): boolean => existsSync(join(root, rel))

const readJson = (root: string, rel: string): Record<string, unknown> | null => {
  try {
    if (!has(root, rel)) return null
    return JSON.parse(readFileSync(join(root, rel), 'utf-8')) as Record<string, unknown>
  } catch {
    return null
  }
}

/** Average source-file line length as a complexity proxy (0..1, lower is better). */
export function complexityRatio(root: string): { ratio: number; avgLines: number } {
  const files = collectSourceFiles(root).slice(0, 500)
  if (files.length === 0) return { ratio: 0, avgLines: 0 }
  let total = 0
  let long = 0
  for (const f of files) {
    try {
      const n = statSync(join(root, f)).size
      if (n > 256 * 1024) continue
      const lines = readFileSync(join(root, f), 'utf-8').split('\n').length
      total += lines
      if (lines > 300) long++
    } catch { /* skip */ }
  }
  const avg = files.length > 0 ? total / files.length : 0
  // Fewer long files + lower average = better; ratio maps to 0..1 where 1 = great DX.
  const longPenalty = long / Math.max(1, files.length)
  const avgPenalty = Math.min(1, avg / 400)
  const ratio = Math.max(0, Math.min(1, 1 - (longPenalty * 0.7 + avgPenalty * 0.3)))
  return { ratio, avgLines: Math.round(avg) }
}

/** Compute the DX score from local evidence. */
export function runDx(root: string): DxReport {
  const scannedAt = Date.now()
  const axes: DxAxis[] = []
  const pct = (v: boolean | number): number => (typeof v === 'number' ? Math.round(Math.min(1, Math.max(0, v)) * 100) : v ? 100 : 0)

  const readme = has(root, 'README.md')
  axes.push({ id: 'readme', label: 'README', score: pct(readme), weight: 10, note: readme ? 'README present' : 'No README — new devs start blind' })

  const contributing = has(root, 'CONTRIBUTING.md')
  axes.push({ id: 'contributing', label: 'Contributing guide', score: pct(contributing), weight: 8, note: contributing ? 'CONTRIBUTING present' : 'No contributing guide' })

  const docs = has(root, 'docs') && readdirSafe(join(root, 'docs')).length > 0
  axes.push({ id: 'docs', label: 'Docs directory', score: pct(docs), weight: 8, note: docs ? 'docs/ populated' : 'No docs directory' })

  const ci = has(root, '.github/workflows') && readdirSafe(join(root, '.github/workflows')).some(f => f.endsWith('.yml') || f.endsWith('.yaml'))
  axes.push({ id: 'ci', label: 'CI workflows', score: pct(ci), weight: 12, note: ci ? 'GitHub Actions present' : 'No CI workflows' })

  const tests = has(root, '__tests__') || has(root, 'tests') || !!readJson(root, 'jest.config.js') || !!readJson(root, 'jest.config.ts') || !!readJson(root, 'package.json')?.jest
  axes.push({ id: 'tests', label: 'Test setup', score: pct(tests), weight: 12, note: tests ? 'Test suite present' : 'No test setup' })

  const lockfile = has(root, 'pnpm-lock.yaml') || has(root, 'package-lock.json') || has(root, 'yarn.lock') || has(root, 'bun.lockb')
  axes.push({ id: 'lockfile', label: 'Lockfile', score: pct(lockfile), weight: 6, note: lockfile ? 'Lockfile committed' : 'No lockfile — non-reproducible installs' })

  const lint = has(root, '.eslintrc.json') || has(root, '.eslintrc.js') || has(root, 'eslint.config.js') || has(root, 'eslint.config.mjs')
  axes.push({ id: 'lint', label: 'Lint config', score: pct(lint), weight: 6, note: lint ? 'Lint configured' : 'No lint config' })

  const editor = has(root, '.editorconfig') || has(root, '.prettierrc') || has(root, '.prettierrc.json')
  axes.push({ id: 'format', label: 'Format config', score: pct(editor), weight: 4, note: editor ? 'Editor/format config present' : 'No editor config' })

  const tsconfig = readJson(root, 'tsconfig.json') as { compilerOptions?: { strict?: boolean } } | null
  const strict = !!tsconfig?.compilerOptions?.strict
  axes.push({ id: 'types', label: 'TypeScript strict', score: pct(strict), weight: 8, note: strict ? 'strict mode on' : 'No strict TypeScript' })

  const changelog = has(root, 'CHANGELOG.md')
  axes.push({ id: 'changelog', label: 'Changelog', score: pct(changelog), weight: 8, note: changelog ? 'CHANGELOG present' : 'No changelog' })

  const onboarding = has(root, 'docs/vectalon/team') || has(root, 'ONBOARDING.md') || has(root, 'docs/ONBOARDING.md')
  axes.push({ id: 'onboarding', label: 'Onboarding assets', score: pct(onboarding), weight: 6, note: onboarding ? 'Team-brain/onboarding artifacts present' : 'No onboarding artifacts' })

  const { ratio, avgLines } = complexityRatio(root)
  axes.push({ id: 'complexity', label: 'Source complexity', score: Math.round(ratio * 100), weight: 12, note: `avg ${avgLines} lines/file, no giant-file sprawl` })

  const totalWeight = axes.reduce((s, a) => s + a.weight, 0)
  const score = Math.round(axes.reduce((s, a) => s + (a.score / 100) * a.weight, 0) / totalWeight * 100)
  const grade: DxReport['grade'] = score >= 85 ? 'A' : score >= 70 ? 'B' : score >= 55 ? 'C' : 'D'

  const improvements = axes
    .filter(a => a.score < 100)
    .map(a => ({ id: a.id, label: a.label, gain: Math.round((100 - a.score) * (a.weight / totalWeight)), action: a.note }))
    .sort((a, b) => b.gain - a.gain)
    .slice(0, 5)

  const verdict: DxVerdict = score >= 70 ? 'approved' : score >= 50 ? 'needs-attention' : 'changes-requested'
  return { scannedAt, root, axes, score, grade, improvements, verdict }
}

function readdirSafe(dir: string): string[] {
  try {
    return readdirSync(dir)
  } catch {
    return []
  }
}

/** Render the DX report as markdown. */
export function renderDxMarkdown(report: DxReport): string {
  const lines = ['# vectalon dx — Developer Experience Score', '']
  lines.push(`Score: **${report.score}/100 (${report.grade})**  ·  Verdict: **${report.verdict}**`, '', '| Axis | Score | Weight | Note |', '|---|---|---|---|')
  for (const a of report.axes) lines.push(`| ${a.label} | ${a.score}/100 | ${a.weight}% | ${a.note} |`)
  lines.push('', '## Top improvements', '')
  for (const i of report.improvements) lines.push(`- **${i.label}** (+${i.gain}pts): ${i.action}`)
  return lines.join('\n')
}

/** Write the markdown + JSON report. */
export function writeDxReport(root: string, report: DxReport): { mdPath: string; jsonPath: string } {
  const dir = dxDocsDir(root)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const mdPath = join(dir, 'report.md')
  const jsonPath = join(dir, 'report.json')
  writeFileSync(mdPath, renderDxMarkdown(report), 'utf-8')
  writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf-8')
  return { mdPath, jsonPath }
}
