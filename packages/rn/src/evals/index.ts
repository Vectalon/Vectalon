/**
 * vectalon evals — Model Evaluation Harness (Roadmap Phase 11, item 095)
 * Business Source License 1.1 (BSL-1.1)
 *
 * Reads .vectalon/evals/cases.json (or a --cases file) of golden cases and
 * scores the recorded `actual` outputs deterministically: exact match,
 * includes, or regex. Compares the pass rate against the previous report
 * for regression detection. Reports to docs/vectalon/evals/ (gitignored).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { EvalCase, EvalMode, EvalReport, EvalResult, EvalVerdict } from './types'

export type { EvalCase, EvalMode, EvalReport, EvalResult, EvalVerdict } from './types'

/** Where evals reports are written. */
export const evalsDocsDir = (root: string): string => join(root, 'docs', 'vectalon', 'evals')

/** Default cases location inside a project. */
export const defaultCasesPath = (root: string): string => join(root, '.vectalon', 'evals', 'cases.json')

/** Load cases from a file (null when missing/invalid). */
export function loadEvalCases(file: string): EvalCase[] | null {
  try {
    if (!existsSync(file)) return null
    const parsed = JSON.parse(readFileSync(file, 'utf-8')) as EvalCase[] | { cases: EvalCase[] }
    const arr = Array.isArray(parsed) ? parsed : parsed.cases
    return Array.isArray(arr) ? arr.filter(c => c && typeof c.id === 'string') : null
  } catch {
    return null
  }
}

/** Score one case deterministically. */
export function scoreCase(c: EvalCase): EvalResult {
  const mode: EvalMode = c.mode ?? 'includes'
  const actual = c.actual ?? ''
  const expected = c.expected ?? ''
  if (mode === 'exact') {
    const passed = actual.trim() === expected.trim()
    return { id: c.id, mode, passed, note: passed ? 'exact match' : `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}` }
  }
  if (mode === 'regex') {
    try {
      const re = new RegExp(expected)
      const passed = re.test(actual)
      return { id: c.id, mode, passed, note: passed ? 'regex matched' : `regex ${expected} did not match output` }
    } catch {
      return { id: c.id, mode, passed: false, note: `invalid regex: ${expected}` }
    }
  }
  const passed = actual.includes(expected)
  return { id: c.id, mode, passed, note: passed ? 'output contains expected' : `expected substring ${JSON.stringify(expected)} not in output` }
}

/** Score a case set and compare against a previous pass rate. */
export function runEvals(cases: EvalCase[], previousPassRate: number | null = null): Omit<EvalReport, 'scannedAt' | 'root' | 'source'> {
  const results = cases.map(scoreCase)
  const passed = results.filter(r => r.passed).length
  const failed = results.length - passed
  const passRate = results.length > 0 ? Math.round((passed / results.length) * 1000) / 10 : 0
  const regression = {
    previousPassRate,
    delta: previousPassRate !== null ? Math.round((passRate - previousPassRate) * 10) / 10 : null,
  }
  const findings: EvalReport['findings'] = []
  if (regression.delta !== null && regression.delta < -5) {
    findings.push({
      id: 'eval-regression',
      severity: 'warning',
      message: `Pass rate dropped ${Math.abs(regression.delta)}pt vs the previous run (${previousPassRate}% → ${passRate}%).`,
      suggestion: 'Re-check recent model/config changes — the harness is scoring a real regression.',
    })
  }
  for (const r of results.filter(r => !r.passed)) {
    findings.push({
      id: 'eval-failed',
      severity: 'warning',
      message: `Case "${r.id}" failed — ${r.note}.`,
      suggestion: 'Fix the model output or the golden reference if the expectation changed.',
    })
  }
  if (results.length === 0) {
    findings.push({
      id: 'no-cases',
      severity: 'info',
      message: 'No eval cases were loaded.',
      suggestion: 'Add golden cases to .vectalon/evals/cases.json.',
    })
  }
  const verdict: EvalVerdict = failed > 0 ? (failed / Math.max(1, results.length) > 0.1 ? 'changes-requested' : 'needs-attention') : 'approved'
  return { cases: results, passed, failed, passRate, regression, findings, verdict }
}

/** Read the previous report's pass rate (for regression), if any. */
export function readPreviousPassRate(root: string): number | null {
  try {
    const prev = JSON.parse(readFileSync(join(evalsDocsDir(root), 'report.json'), 'utf-8')) as { passRate?: number }
    return typeof prev.passRate === 'number' ? prev.passRate : null
  } catch {
    return null
  }
}

/** Run one evals pass. */
export function runEvalsCommand(root: string, options: { cases?: string } = {}): EvalReport {
  const scannedAt = Date.now()
  const casesPath = options.cases ?? defaultCasesPath(root)
  const cases = loadEvalCases(casesPath)
  const source = existsSync(casesPath) ? casesPath : '(no cases file)'
  if (cases === null) {
    return {
      scannedAt, root, source, cases: [], passed: 0, failed: 0, passRate: 0,
      regression: { previousPassRate: null, delta: null },
      findings: [{
        id: 'no-cases', severity: 'warning',
        message: `No eval cases found at ${casesPath} (or the file is invalid).`,
        suggestion: 'Create .vectalon/evals/cases.json with { cases: [{ id, input, expected, actual, mode }] }.',
      }], verdict: 'changes-requested',
    }
  }
  const previousPassRate = readPreviousPassRate(root)
  return { scannedAt, root, source, ...runEvals(cases, previousPassRate) }
}

/** Render the eval report as markdown. */
export function renderEvalsMarkdown(report: EvalReport): string {
  const lines = ['# vectalon evals — Model Evaluation', '']
  const r = report.regression
  lines.push(
    `Cases: ${report.cases.length}  ·  Pass: ${report.passed}/${report.cases.length} (${report.passRate}%)  ·  Verdict: **${report.verdict}**`,
    '',
  )
  if (r.delta !== null) lines.push(`Regression vs previous run: ${r.delta >= 0 ? '+' : ''}${r.delta}pt (previous ${r.previousPassRate}%)`, '')
  lines.push('| Case | Mode | Result | Note |', '|---|---|---|---|')
  for (const c of report.cases) lines.push(`| ${c.id} | ${c.mode} | ${c.passed ? 'PASS' : 'FAIL'} | ${c.note.replace(/\|/g, '/')} |`)
  lines.push('', '## Findings', '')
  for (const f of report.findings) {
    const mark = f.severity === 'warning' ? 'WARN' : 'INFO'
    lines.push(`### [${mark}] ${f.id}`, '', f.message, '', `**Suggestion**: ${f.suggestion}`, '')
  }
  return lines.join('\n')
}

/** Write the markdown + JSON report. */
export function writeEvalsReport(root: string, report: EvalReport): { mdPath: string; jsonPath: string } {
  const dir = evalsDocsDir(root)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const mdPath = join(dir, 'report.md')
  const jsonPath = join(dir, 'report.json')
  writeFileSync(mdPath, renderEvalsMarkdown(report), 'utf-8')
  writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf-8')
  return { mdPath, jsonPath }
}
