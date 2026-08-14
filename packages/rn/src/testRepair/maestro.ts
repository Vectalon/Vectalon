/**
 * vectalon test-repair — Maestro failure classifier (Roadmap Phase 8, item 065)
 * Business Source License 1.1 (BSL-1.1)
 *
 * A pattern-based parser for failing Maestro E2E output: flow discovery,
 * assertions, element visibility, app state, device connection, and Maestro
 * version mismatches — each with the standard fix. Pure text parsing,
 * hermetic-testable.
 */

import { existsSync, readFileSync } from 'fs'
import { reportError } from '../utils/safe'
import type { LogAnalysis } from '../projectDiagnostics/types'

interface MaestroPattern {
  id: string
  name: string
  re: RegExp
  fix: string
}

/** The top Maestro failures, ordered most-specific first. */
export const MAESTRO_PATTERNS: MaestroPattern[] = [
  {
    id: 'assertion-failed',
    name: 'Assertion failed',
    re: /Assertion failed|AssertionError|The assertion failed|assertVisible|assertNotVisible/i,
    fix: 'The screen state does not match the assertion: check the visible/notVisible condition, the text (exact match vs regex), and that the app reached the expected screen — the flow is asserting on a state the app never reached.',
  },
  {
    id: 'element-not-found',
    name: 'Element not found',
    re: /Element is not found|Could not find element|not found on screen|Element with id|Element with text.*not found/i,
    fix: 'Maestro cannot find the element: fix the id/text selector (accessibilityLabel vs testID — `text` matches label text), wait for async content (`extendedWaitUntil`), scroll before tapping (`scrollUntilVisible`), or the flow taps before the screen renders.',
  },
  {
    id: 'app-not-running',
    name: 'App not running',
    re: /The app is not running|App not running|No app.*installed|Application is not installed/i,
    fix: 'Maestro launched with no app: make sure the flow starts with `launchApp`, appId in the flow matches the installed bundle id, and the build on the device is current.',
  },
  {
    id: 'device-connection',
    name: 'Device / driver connection failure',
    re: /Unable to connect to (the )?device|No device found|failed to (start|connect).*driver|Espresso.*failed|XCUITest.*failed|Command failed/i,
    fix: 'Maestro cannot drive the device: boot the emulator/simulator first, keep the Maestro driver (Espresso/XCUITest) on the app build, and check `adb devices` / `xcrun simctl list` before re-running.',
  },
  {
    id: 'version-mismatch',
    name: 'Maestro version mismatch',
    re: /Please update Maestro|This version of Maestro|Maestro version.*(?:too old|not supported)|requires a newer version of Maestro/i,
    fix: 'Your Maestro CLI is too old for the flow/app: update it (`curl -Ls "https://get.maestro.mobile.dev" | bash`) and re-run — flow syntax and app features move fast between releases.',
  },
]

/** Parse a Maestro log and return the root-cause classification. */
export function analyzeMaestroLog(log: string): LogAnalysis {
  const matches: LogAnalysis['matches'] = []
  const lines = log.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    for (const pattern of MAESTRO_PATTERNS) {
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

/** Read a Maestro log file and analyze it; null when the file is missing. */
export function analyzeMaestroLogFile(path: string): LogAnalysis | null {
  try {
    if (!existsSync(path)) return null
    return analyzeMaestroLog(readFileSync(path, 'utf-8'))
  } catch (err) {
    reportError(err, `test-repair: reading maestro log ${path}`)
    return null
  }
}
