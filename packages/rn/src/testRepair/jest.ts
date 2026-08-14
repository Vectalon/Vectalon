/**
 * vectalon test-repair — Jest failure classifier (Roadmap Phase 8, item 065)
 * Business Source License 1.1 (BSL-1.1)
 *
 * A pattern-based parser for failing Jest output: assertion mismatches,
 * snapshot drift, open handles, suite-collection errors, module resolution,
 * transform errors, missing globals, worker crashes, and async timeouts —
 * each with the standard fix. Pure text parsing, hermetic-testable.
 */

import { existsSync, readFileSync } from 'fs'
import { reportError } from '../utils/safe'
import type { LogAnalysis } from '../projectDiagnostics/types'

interface JestPattern {
  id: string
  name: string
  re: RegExp
  fix: string
}

/** The top Jest failures, ordered most-specific first. */
export const JEST_PATTERNS: JestPattern[] = [
  {
    id: 'snapshot-mismatch',
    name: 'Snapshot mismatch',
    re: /Snapshot name:|toMatchSnapshot\(\) failed|Received value does not match the stored snapshot|snapshot.*does not match/i,
    fix: 'The rendered output drifted from the stored snapshot: review the diff — if the change is intended, `jest -u` to update it; if not, fix the component. Never blanket-update to hide a real regression.',
  },
  {
    id: 'assertion-failure',
    name: 'Assertion failure',
    re: /expect\(.*\)\.(?:toBe|toEqual|toHaveLength|toContain|toBeTruthy|toBeFalsy|toMatchObject|toHaveBeenCalled)/i,
    fix: 'The assertion failed — read the Expected vs Received diff at the failing line: the code under test returns something other than the test expects. Fix the implementation, the fixture, or the expectation (one of the three is wrong).',
  },
  {
    id: 'open-handle',
    name: 'Open handle / process did not exit',
    re: /Jest did not exit one second after the test run has completed|A worker process has failed to exit gracefully|--forceExit/i,
    fix: 'A test leaks a handle (server, DB connection, interval, watcher): close it in afterAll / teardown, run with `--detectOpenHandles` to find the culprit, and avoid `--forceExit` as a band-aid.',
  },
  {
    id: 'test-suite-error',
    name: 'Test suite failed to collect',
    re: /Your test suite must contain at least one test|● Test suite failed to run|SyntaxError:|Cannot use import statement outside a module/i,
    fix: 'The suite fails at collection time, before any test runs: check module-scope imports and mocks, fix syntax errors, and ensure describe/it blocks exist — a bad import or a top-level throw fails the whole file.',
  },
  {
    id: 'module-resolution',
    name: 'Module resolution failure (tests)',
    re: /Cannot find module ['"][^'"]+['"] from ['"][^'"]+['"]|Module not found: |Could not locate module/i,
    fix: 'Jest cannot resolve the import: fix the path (extension / index), add the package, or map non-JS assets (styles, images, native modules) via `moduleNameMapper` in jest config.',
  },
  {
    id: 'transform-error',
    name: 'Transform / preset error',
    re: /Transform failed|Unexpected token|ts-jest.*error|babel-jest|The preset ['"][^'"]+['"] is not found|Cannot find module ['"]babel-jest['"]/i,
    fix: 'Jest cannot transform the file: align tsconfig + jest config (preset react-native / ts-jest / babel-jest), install the missing preset, and check the file\'s syntax/extensions.',
  },
  {
    id: 'missing-global',
    name: 'Missing global in test environment',
    re: /ReferenceError: [A-Za-z_$][\w$]* is not defined/i,
    fix: 'The test references a global Jest does not provide (fetch, localStorage, matchMedia…): define it in a setup file (jest.setup) or mock it per test with jest.fn().',
  },
  {
    id: 'worker-crash',
    name: 'Worker crash / out of memory',
    re: /A worker process has failed to exit gracefully|Ran out of memory|JavaScript heap out of memory|--maxWorkers/i,
    fix: 'A worker died (often OOM or a hard crash): isolate the failing test (`-t`), reduce parallelism (`--maxWorkers=2`), raise the Node heap (`NODE_OPTIONS=--max-old-space-size=4096`), and split heavy suites.',
  },
  {
    id: 'async-timeout',
    name: 'Async timeout',
    re: /Exceeded timeout of \d+ ms|thrown: ["']Exceeded timeout/i,
    fix: 'The async test never settled: await the promise (missing await is the usual culprit), mock the slow dependency (network/timer), or raise testTimeout only after ruling out a real hang.',
  },
]

/** Parse a Jest log and return the root-cause classification. */
export function analyzeJestLog(log: string): LogAnalysis {
  const matches: LogAnalysis['matches'] = []
  const lines = log.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    for (const pattern of JEST_PATTERNS) {
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

/** Read a Jest log file and analyze it; null when the file is missing. */
export function analyzeJestLogFile(path: string): LogAnalysis | null {
  try {
    if (!existsSync(path)) return null
    return analyzeJestLog(readFileSync(path, 'utf-8'))
  } catch (err) {
    reportError(err, `test-repair: reading jest log ${path}`)
    return null
  }
}
