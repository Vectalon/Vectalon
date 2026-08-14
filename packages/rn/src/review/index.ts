/**
 * vectalon review — PR Review Agent (Roadmap Phase 8, item 061)
 * Business Source License 1.1 (BSL-1.1)
 *
 * One pass over a git diff that flags what a PR introduces: the deterministic
 * CodeReviewAnalyzer runs on each changed file's added lines (pinned to real
 * new-file line numbers), the team-brain coding standards (043) are
 * cross-checked as line-level probes, and an optional LLM pass (061) reviews
 * the diff against the project's own standards. Deterministic and
 * hermetic-testable — callers may inject `git diff` output, and non-git
 * projects degrade to an empty review. Reports to docs/vectalon/review/
 * (gitignored).
 */

import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { CodeReviewAnalyzer } from '../sdlc/CodeReviewAnalyzer'
import { reviewCodeWithLLM } from '../sdlc/LLMCodeReviewer'
import { deriveStandards } from '../teamBrain/standards'
import { deriveGitDiff, parseGitDiff } from './gitDiff'
import { standardsCheck } from './standards'
import type { ParsedDiffFile } from './gitDiff'
import type { ReviewFileResult, ReviewResult, ReviewOptions, ReviewVerdict } from './types'

/** Where review reports are written (mirrors other docs/vectalon/* dirs). */
export const reviewDocsDir = (root: string): string => join(root, 'docs', 'vectalon', 'review')

/** Which language the analyzer should assume for a file path. */
function languageOf(path: string): string {
  if (path.endsWith('.ts') || path.endsWith('.tsx')) return 'tsx'
  if (path.endsWith('.js') || path.endsWith('.jsx')) return 'jsx'
  if (path.endsWith('.json')) return 'json'
  return 'tsx'
}

/** Deterministic + optional-LLM review of one changed file's added lines. */
async function reviewFile(
  file: ParsedDiffFile,
  standards: ReturnType<typeof deriveStandards>,
  analyzer: CodeReviewAnalyzer,
  llmRouter: ReviewOptions['modelRouter'],
  allowLlm: boolean
): Promise<ReviewFileResult> {
  const addedCode = file.addedLines.map(a => a.text).join('\n')
  const findings = analyzer.review(addedCode, languageOf(file.path)).map(f => ({
    ...f,
    // Analyzer line numbers are relative to the added-lines snippet; remap
    // them to the real new-file lines.
    line: file.addedLines[Math.min(f.line - 1, file.addedLines.length - 1)]?.line ?? f.line,
  }))
  const standardFindings = standardsCheck(standards, file.addedLines)

  let llm = null
  if (allowLlm && llmRouter) {
    try {
      const standardsContext = standards
        .filter(s => s.status !== 'recommended')
        .map(s => `- ${s.rule} (${s.status}): ${s.detail}`)
        .join('\n')
      llm = await reviewCodeWithLLM(llmRouter, {
        code: addedCode,
        fileName: file.path,
        context: `Project standards derived from the repo (enforce these):\n${standardsContext || '(none derived)'}`,
      })
    } catch {
      // A dead model must never fail the review — keep the deterministic pass.
      llm = null
    }
  }

  return { path: file.path, addedLines: file.addedLines.length, findings, standardFindings, llm }
}

/** The overall verdict: errors block, warnings need attention, else approve. */
export function verdictOf(files: ReviewFileResult[]): ReviewVerdict {
  if (files.some(f => f.findings.some(x => x.severity === 'error'))) return 'changes-requested'
  if (files.some(f => f.llm?.verdict === 'changes-requested')) return 'changes-requested'
  if (files.some(f => f.findings.length > 0 || f.standardFindings.length > 0)) return 'needs-attention'
  return 'approved'
}

/** Run one PR-review pass over the project's diff. */
export async function runReview(root: string, options: ReviewOptions = {}): Promise<ReviewResult> {
  const scannedAt = Date.now()
  const diff = await deriveGitDiff(root, { base: options.base, gitDiffOutput: options.gitDiffOutput })
  const files = parseGitDiff(diff)
  const standards = deriveStandards(root)
  const analyzer = new CodeReviewAnalyzer()

  const reviewed: ReviewFileResult[] = []
  const maxLlm = options.maxLlmFiles ?? 10
  for (let i = 0; i < files.length; i++) {
    reviewed.push(await reviewFile(files[i], standards, analyzer, options.modelRouter, i < maxLlm))
  }

  const errors = reviewed.reduce((n, f) => n + f.findings.filter(x => x.severity === 'error').length, 0)
  const warnings = reviewed.reduce((n, f) => n + f.findings.filter(x => x.severity === 'warning').length, 0)
  const infos = reviewed.reduce((n, f) => n + f.findings.filter(x => x.severity === 'info').length, 0)
  const standardFindings = reviewed.reduce((n, f) => n + f.standardFindings.length, 0)
  const findings = errors + warnings + infos + standardFindings
  const addedLines = reviewed.reduce((n, f) => n + f.addedLines, 0)

  return {
    scannedAt,
    root,
    base: options.base || 'working-tree',
    files: reviewed,
    summary: { files: reviewed.length, addedLines, findings, errors, warnings, infos },
    verdict: verdictOf(reviewed),
  }
}

/** Render the review as markdown (written to docs/vectalon/review/review.md). */
export function renderReview(result: ReviewResult): string {
  const lines = [`# PR Review — ${result.base}`, '']
  lines.push(`- Verdict: **${result.verdict}**`)
  lines.push(`- Files: ${result.summary.files} | Added lines: ${result.summary.addedLines}`)
  lines.push(`- Findings: ${result.summary.findings} (${result.summary.errors} error(s), ${result.summary.warnings} warning(s), ${result.summary.infos} info)`)
  lines.push('')

  if (result.files.length === 0) {
    lines.push('No changes to review — the diff is empty.')
    return lines.join('\n')
  }

  for (const file of result.files) {
    lines.push(`## ${file.path}`)
    lines.push(`${file.addedLines} added line(s)`)
    const all = [...file.findings, ...file.standardFindings]
    if (all.length === 0) {
      lines.push('- No findings.')
    } else {
      for (const f of all) {
        lines.push(`- [${f.severity}] ${f.rule} (line ${f.line}) — ${f.message}`)
      }
    }
    if (file.llm) {
      lines.push(`- **LLM**: ${file.llm.verdict} — ${file.llm.summary}`)
      for (const f of file.llm.findings) {
        lines.push(`  - [${f.severity}] ${f.rule} (line ${f.line}) — ${f.message}${f.suggestion ? ` Suggestion: ${f.suggestion}` : ''}`)
      }
    }
    lines.push('')
  }
  return lines.join('\n')
}

/** Write review.md + report.json into docs/vectalon/review/ (gitignored). */
export function writeReviewReport(root: string, result: ReviewResult): { mdPath: string; jsonPath: string } {
  const dir = reviewDocsDir(root)
  mkdirSync(dir, { recursive: true })
  const mdPath = join(dir, 'review.md')
  const jsonPath = join(dir, 'report.json')
  writeFileSync(mdPath, renderReview(result))
  writeFileSync(jsonPath, JSON.stringify(result, null, 2) + '\n')
  return { mdPath, jsonPath }
}
