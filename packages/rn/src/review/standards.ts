/**
 * vectalon review — team-brain standards cross-check (Roadmap 043 + 061)
 * Business Source License 1.1 (BSL-1.1)
 *
 * The Team Brain derives the project's coding standards from what is on disk
 * (043). The review agent turns those standards into line-level probes so a
 * diff is checked against the project's own declared conventions — not just
 * generic rules. Only *enforced* or *detected* standards probe lines;
 * recommended-but-not-adopted standards are reported, not enforced.
 */

import type { CodingStandard } from '../teamBrain/types'
import type { AddedLine } from './gitDiff'
import type { ReviewFinding } from '../sdlc/CodeReviewAnalyzer'

/** A probe: matches a derived standard, then tests each added line. */
interface StandardProbe {
  /** Matches when the derived standard is one this probe enforces. */
  matches: (s: CodingStandard) => boolean
  /** Stable finding rule id. */
  rule: string
  severity: ReviewFinding['severity']
  /** Message template; receives the standard it fired on. */
  message: (s: CodingStandard) => string
  /** True when the added line violates the standard. */
  test: (line: string) => boolean
  /** File-level probes fire once per file instead of once per line. */
  fileLevel?: boolean
}

const PROBES: StandardProbe[] = [
  {
    // TypeScript strict mode is enforced → `any` and non-null assertions
    // contradict the project's own type-safety standard.
    matches: s =>
      /TypeScript/.test(s.rule) && /strict/.test(s.detail) && s.status !== 'recommended',
    rule: 'standard-strict-types',
    severity: 'warning',
    message: s => `Project standard (${s.rule}): ${s.detail} — strict typing forbids \`any\` and non-null assertions.`,
    test: line => /:\s*any\b|as\s+any\b|<any>/.test(line) || /![.?)]/.test(line),
  },
  {
    // StyleSheet is the project's styling system → inline style objects
    // contradict the derived styling standard.
    matches: s => /StyleSheet/.test(s.rule) && s.status !== 'recommended',
    rule: 'standard-stylesheet',
    severity: 'info',
    message: s => `Project standard (${s.rule}): ${s.detail} — prefer StyleSheet.create over inline style objects.`,
    test: line => /style=\{\{/.test(line),
  },
  {
    // ESLint is installed → console.log/debug contradict the lint standard.
    matches: s => /ESLint/.test(s.rule) && s.status !== 'recommended',
    rule: 'standard-lint',
    severity: 'warning',
    message: s => `Project standard (${s.rule}): ${s.detail} — console.log/debug will fail lint.`,
    test: line => /console\.(log|debug)\s*\(/.test(line),
  },
  {
    // A testing standard is enforced → a changed file with no test change is
    // reported at info level (the probe fires on .ts/.tsx added lines only).
    matches: s => /tests?:/i.test(s.rule) && s.status === 'enforced',
    rule: 'standard-tests',
    severity: 'info',
    message: s => `Project standard (${s.rule}): ${s.detail} — add or update tests for this change.`,
    test: () => true,
    // One note per file (fires on the first added line), not one per line.
    fileLevel: true,
  },
]

/** Probe added lines against the project's derived standards. */
export function standardsCheck(standards: CodingStandard[], addedLines: AddedLine[]): ReviewFinding[] {
  const findings: ReviewFinding[] = []
  for (const standard of standards) {
    for (const probe of PROBES) {
      if (!probe.matches(standard)) continue
      for (const added of addedLines) {
        if (probe.fileLevel) {
          if (added.line === addedLines[0]?.line && probe.test(added.text)) {
            findings.push({
              severity: probe.severity,
              rule: probe.rule,
              message: probe.message(standard),
              line: added.line,
            })
          }
          continue
        }
        if (probe.test(added.text)) {
          findings.push({
            severity: probe.severity,
            rule: probe.rule,
            message: probe.message(standard),
            line: added.line,
          })
        }
      }
    }
  }
  return findings.sort((a, b) => a.line - b.line)
}
