/**
 * RN version drift warning (P1-14).
 *
 * When a project uses a React Native version newer than the newest version
 * the guardrail rules / codemod catalog / upgrade paths know about, emit a
 * loud warning so nobody gets false confidence from rule sets that may not
 * match the installed runtime. Wired into `vectalon init` and `vectalon
 * serve`.
 */

import { KNOWN_RN_MINORS, LATEST_KNOWN_RN } from './catalog'
import { logger } from '../cli/logger'

const RN_VERSION_RE = /^(\d+)\.(\d+)\.(\d+)/

/** The minor of a semver RN version, or null when it is not parseable. */
export function rnMinorOf(version: string): number | null {
  const match = version.match(RN_VERSION_RE)
  return match ? parseInt(match[2], 10) : null
}

/** True when the project RN minor exceeds every minor the rule set knows. */
export function rnIsAheadOfRuleSet(version: string): boolean {
  const minor = rnMinorOf(version)
  if (minor === null) return false
  return minor > Math.max(...KNOWN_RN_MINORS)
}

/** The loud, single-line warning text (exported for tests/rendering). */
export function rnDriftWarning(version: string): string {
  return (
    `This project uses React Native ${version}, which is newer than the newest version ` +
    `Vectalon's rule set knows (${LATEST_KNOWN_RN}). Some guardrails, codemods, and ` +
    `upgrade steps may be inaccurate.`
  )
}

/**
 * Warn once per process when `version` is ahead of the rule set. Returns
 * whether a warning was emitted.
 */
export function warnIfRnVersionAhead(version: string): boolean {
  if (!rnIsAheadOfRuleSet(version)) return false
  logger.warn(rnDriftWarning(version))
  return true
}
