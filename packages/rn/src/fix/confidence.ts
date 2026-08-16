/**
 * vc fix — confidence: a deterministic, explainable confidence from evidence
 * strength + verification results. No model involved; the number tells the
 * user how much of the verdict is pinned by proof vs. heuristics.
 * Business Source License 1.1 (BSL-1.1)
 */
import type { FixFinding, FixVerification } from './types'

export function computeConfidence(findings: FixFinding[], verification: FixVerification[]): number {
  if (findings.length === 0) return 100
  const root = findings.find(f => f.rootCause) ?? findings[0]

  // Base: how the root cause was established.
  let score = root.confidence
  const evidence = root.evidence ?? []

  // +5 when the evidence names a concrete file:line (pinned, not guessed).
  if (evidence.some(e => e.file !== 'log' || e.line)) score += 5
  // +5 when the fix produced at least one applied edit (the loop is real).
  if (findings.some(f => f.applied === 'applied')) score += 5
  // +4 per passing verification check (capped at +8) — proof raises confidence,
  // but a failing check outweighs it: −15 each, so a fix that breaks the build
  // never reads as high-confidence.
  let passBonus = 0
  for (const v of verification) {
    if (v.status === 'pass') passBonus += 4
    if (v.status === 'fail') score -= 15
  }
  score += Math.min(8, passBonus)
  // −5 when the root cause came only from issue-text routing (no log, no file pin).
  if (evidence.every(e => e.file === 'log' && !e.line) && !evidence.some(e => e.file !== 'log')) score -= 5

  return Math.max(30, Math.min(98, Math.round(score)))
}
