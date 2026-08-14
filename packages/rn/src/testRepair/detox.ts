/**
 * vectalon test-repair — Detox failure classifier (Roadmap Phase 8, item 065)
 * Business Source License 1.1 (BSL-1.1)
 *
 * A pattern-based parser for failing Detox E2E output: app launch failures,
 * element-not-found / waitFor timeouts, TOCTOU flakiness, build failures,
 * permissions dialogs, and test-runner errors — each with the standard fix.
 * Pure text parsing, hermetic-testable.
 */

import { existsSync, readFileSync } from 'fs'
import { reportError } from '../utils/safe'
import type { LogAnalysis } from '../projectDiagnostics/types'

interface DetoxPattern {
  id: string
  name: string
  re: RegExp
  fix: string
}

/** The top Detox failures, ordered most-specific first. */
export const DETOX_PATTERNS: DetoxPattern[] = [
  {
    id: 'launch-failure',
    name: 'App launch failure',
    re: /Failed to launch (the )?app|app\.launch\(\)|Cannot launch the app|The app is not running|Application .* failed to launch/i,
    fix: 'Detox could not launch the app: run `detox build` first (install the app on the booted simulator), keep the app binary/configurationId in detox.config in sync, and check launchArgs for environment-dependent behavior.',
  },
  {
    id: 'element-not-found',
    name: 'Element not found / waitFor timeout',
    re: /Element not found|Failed to find element|Unable to find element|Wait for .* to exist|is not visible: .*not visible|by\.id\(.*\)\.toExist\(\) timed out/i,
    fix: 'The element never appeared: verify the testID matches the component, the screen is actually shown (navigation), and wait for async content — add `waitFor(...).toBeVisible().withTimeout(...)`, scroll (`scrollUntilVisible`), or disable animations in the test build.',
  },
  {
    id: 'toctou',
    name: 'TOCTOU flakiness',
    re: /TOCTOU|flak(y|iness)|timing race/i,
    fix: 'A time-of-check/time-of-use race: avoid fixed sleeps and immediate assertions — rely on waitFor/expect visibility semantics, freeze animations + network in the test build (Detox sync), and keep assertions on app state, not wall-clock time.',
  },
  {
    id: 'build-failure',
    name: 'Detox build failure (native)',
    re: /Detox build failed|xcodebuild.*(?:failed|error)|gradlew.*(?:failed|error)|detox build/i,
    fix: 'The native test build failed before tests ran: run `detox build --configuration <cfg>` with `--loglevel verbose`, fix the underlying Xcode/Gradle error (pods, signing, SDK — run `vectalon build-fix --log` on that output), then rebuild.',
  },
  {
    id: 'permissions',
    name: 'Permissions dialog blocking',
    re: /permissions|alert.*(?:location|photos|camera)|TCC/i,
    fix: 'A system permission dialog blocked the flow: grant permissions deterministically via device.launchApp({ permissions: { location: "YES" } }) (or detox.config permissions) instead of tapping through OS alerts.',
  },
  {
    id: 'test-runner-error',
    name: 'Test runner configuration error',
    re: /jest-circus|Test runner error|detox.*jest.*config/i,
    fix: 'The E2E runner is misconfigured: keep the Jest setup for Detox in sync (detox.config testRunner, globalSetup for the app session) and match the jest version Detox expects for your release.',
  },
]

/** Parse a Detox log and return the root-cause classification. */
export function analyzeDetoxLog(log: string): LogAnalysis {
  const matches: LogAnalysis['matches'] = []
  const lines = log.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    for (const pattern of DETOX_PATTERNS) {
      if (pattern.re.test(line)) {
        matches.push({ id: pattern.id, name: pattern.name, line: i + 1, fix: pattern.fix })
      }
    }
  }
  const first = matches[0] ?? null
  const rootCause = first ? { id: first.id, name: first.name, fix: first.fix } : null
  const evidence = lines.filter(l => l.trim()).slice(-25)
  return { rootCause, matches, evidence }
}

/** Read a Detox log file and analyze it; null when the file is missing. */
export function analyzeDetoxLogFile(path: string): LogAnalysis | null {
  try {
    if (!existsSync(path)) return null
    return analyzeDetoxLog(readFileSync(path, 'utf-8'))
  } catch (err) {
    reportError(err, `test-repair: reading detox log ${path}`)
    return null
  }
}
