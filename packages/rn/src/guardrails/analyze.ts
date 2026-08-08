/**
 * Guarded AST analysis for the guardrail path (P0-9).
 *
 * The scanner's AST analysis (`analyzeSourceFile`) can throw on exotic or
 * corrupted input — experimental syntax, a pathological AST that blows the
 * node budget, a stack overflow on deep nesting. Guardrails run on every
 * save, so a parse failure must degrade to one clear error instead of
 * crashing the guardrail run (or the extension host).
 *
 * `analyzeSourceGuarded` wraps the analysis in `safe()` and enforces the
 * node budget from AstScanner; callers get a structured result and always
 * know whether the file parsed.
 */

import { analyzeSourceFile, type SourceAnalysis } from '../harness/AstScanner'
import { safe } from '../utils/safe'

export interface GuardedAnalysis {
  filePath: string
  /** True when the file parsed and analysis completed. */
  parsed: boolean
  analysis: SourceAnalysis | null
  /** Human-readable reason when the file could not be analyzed. */
  error?: string
}

export interface GuardedAnalysisOptions {
  /** Max AST nodes before bailing (default from AstScanner). */
  nodeBudget?: number
}

/** The single diagnostic message emitted when a file cannot be parsed. */
export const PARSE_FAILURE_MESSAGE = 'Vectalon: could not parse file'

/**
 * Analyze a file with parse protection: never throws, never hangs on a
 * pathological AST. On failure returns `parsed: false` with a stable message
 * the extension can surface as exactly one diagnostic.
 */
export function analyzeSourceGuarded(
  content: string,
  filePath: string,
  options: GuardedAnalysisOptions = {}
): GuardedAnalysis {
  const result = safe(
    () => analyzeSourceFile(content, filePath, { nodeBudget: options.nodeBudget }),
    'guardrails: analyzing source'
  )
  if (result.ok && result.value) {
    return { filePath, parsed: true, analysis: result.value }
  }
  const error =
    result.ok ? 'the file could not be parsed (empty or unsupported syntax)'
    : result.error.message
  return { filePath, parsed: false, analysis: null, error }
}
