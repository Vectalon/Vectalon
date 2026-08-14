/**
 * vectalon review — PR Review Agent (Roadmap Phase 8, item 061)
 * Business Source License 1.1 (BSL-1.1)
 */

import type { ReviewFinding } from '../sdlc/CodeReviewAnalyzer'
import type { LLMCodeReview } from '../sdlc/LLMCodeReviewer'
import type { ModelRouter } from '../model/ModelRouter'

export type ReviewVerdict = 'approved' | 'needs-attention' | 'changes-requested'

export interface ReviewFileResult {
  /** New-side path of the changed file, e.g. `src/screens/Payment.tsx`. */
  path: string
  /** Number of added lines in the diff. */
  addedLines: number
  /** Deterministic rule findings (line = real new-file line). */
  findings: ReviewFinding[]
  /** Team-brain standards cross-check findings (043). */
  standardFindings: ReviewFinding[]
  /** Optional LLM review pass (absent when no model router is wired). */
  llm?: LLMCodeReview | null
}

export interface ReviewSummary {
  files: number
  addedLines: number
  findings: number
  errors: number
  warnings: number
  infos: number
}

/** The full result of one PR-review pass. */
export interface ReviewResult {
  scannedAt: number
  root: string
  /** The diff base — `working-tree` when reviewing uncommitted changes. */
  base: string
  files: ReviewFileResult[]
  summary: ReviewSummary
  verdict: ReviewVerdict
}

export interface ReviewOptions {
  /** Git ref the diff is taken against (e.g. `main`); absent = working tree. */
  base?: string
  /** Injectable `git diff` output (hermetic tests); absent = run real git. */
  gitDiffOutput?: string
  /** Model router for the optional LLM pass; absent/undefined = rule-only. */
  modelRouter?: ModelRouter | null
  /** Cap on files sent to the LLM pass (default 10). */
  maxLlmFiles?: number
}
