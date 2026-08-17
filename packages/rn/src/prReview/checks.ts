/**
 * vectalon pr — the five diff-scoped checks.
 * Business Source License 1.1 (BSL-1.1)
 *
 * Every check runs against what the PR actually introduced — the added
 * lines of the changed files — reusing the committed scanners where they
 * already do per-file work (security scanSecrets, perfScan render/startup/
 * bridge). A finding only counts when it sits on an added line, so a PR
 * review never re-flags pre-existing debt in an untouched line.
 */
import { existsSync, readFileSync } from 'fs'
import { dirname, join, normalize, sep } from 'path'
import { scanSecrets } from '../security/scan'
import { scanRenderHazards } from '../perfScan/render'
import { scanStartupHazards } from '../perfScan/startup'
import { scanBridgeHazards } from '../perfScan/bridge'
import { addedLineSet } from './diff'
import type { PrChangedFile, PrReviewIssue, PrReviewSeverity } from './types'

/** Feature dirs — the arch-score layering boundary (features depend on shared). */
export const FEATURE_DIRS = new Set(['screens', 'features', 'pages', 'modules', 'services'])

export const LOCKFILES = ['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'bun.lockb']

const MAX_PER_DIMENSION = 5

function isSharedPath(path: string): boolean {
  const segments = path.split(/[\\/]/)
  return !segments.some(s => FEATURE_DIRS.has(s))
}

function issue(
  id: string,
  dimension: PrReviewIssue['dimension'],
  severity: PrReviewSeverity,
  file: string,
  line: number,
  message: string,
  suggestion: string
): PrReviewIssue {
  return {
    id,
    dimension,
    severity,
    priority: severity === 'error' && dimension === 'performance' ? 'P1' : severity === 'error' ? 'P0' : severity === 'warning' ? 'P1' : 'P2',
    file,
    line,
    message,
    suggestion,
  }
}

function readFile(root: string, path: string): string | null {
  try {
    if (!existsSync(join(root, path))) return null
    return readFileSync(join(root, path), 'utf-8')
  } catch {
    return null
  }
}

/** Extract module specifiers from an import/require/dynamic-import line. */
function importSpecifiers(line: string): string[] {
  const out: string[] = []
  const patterns = [
    /import\s+[^'"]*\s+from\s+['"]([^'"]+)['"]/,
    /^import\s+['"]([^'"]+)['"]/,
    /require\(\s*['"]([^'"]+)['"]\s*\)/,
    /import\(\s*['"]([^'"]+)['"]\s*\)/,
  ]
  for (const re of patterns) {
    const m = line.match(re)
    if (m) out.push(m[1])
  }
  return out
}

/** Resolve a relative specifier to a normalized path (extensions not required). */
function resolveRelative(fromFile: string, specifier: string): string | null {
  if (!specifier.startsWith('.')) return null
  const base = dirname(fromFile)
  const joined = normalize(join(base, specifier))
  return joined.startsWith('..' + sep) || joined.startsWith('.' + sep) || joined === '.' ? null : joined
}

/** Architecture: shared → feature imports introduced on added lines. */
export function checkArchitecture(root: string, changed: PrChangedFile[]): PrReviewIssue[] {
  const findings: PrReviewIssue[] = []
  for (const f of changed) {
    if (!/\.(ts|tsx|js|jsx)$/.test(f.path)) continue
    if (!isSharedPath(f.path)) continue // only shared files can violate (shared → feature)
    for (const line of f.addedLines) {
      for (const spec of importSpecifiers(line.text)) {
        const target = resolveRelative(f.path, spec)
        if (!target) continue
        if (isSharedPath(target)) continue // shared → shared is fine
        findings.push(
          issue(
            'layer-violation',
            'architecture',
            'warning',
            f.path,
            line.line,
            `Shared file ${f.path} imports feature code (${target}) — features depend on shared, never the reverse.`,
            'Move the imported module into a shared location (components, hooks, lib) or invert the dependency.'
          )
        )
      }
    }
  }
  return findings.slice(0, MAX_PER_DIMENSION)
}

/** Dependencies: manifest/lockfile consistency + resolvability of added deps. */
export function checkDependencies(root: string, changed: PrChangedFile[]): PrReviewIssue[] {
  const findings: PrReviewIssue[] = []
  const paths = new Set(changed.map(f => f.path))
  const pkgFile = changed.find(f => f.path === 'package.json')

  if (pkgFile) {
    const addedDeps: string[] = []
    for (const line of pkgFile.addedLines) {
      const m = line.text.match(/^\s*"([^"]+)":\s*"[^"]+"\s*,?\s*$/)
      if (m) addedDeps.push(m[1])
    }
    for (const dep of addedDeps) {
      if (!existsSync(join(root, 'node_modules', dep))) {
        findings.push(
          issue(
            'dep-not-installed',
            'dependencies',
            'error',
            'package.json',
            0,
            `Dependency "${dep}" is added but not installed in node_modules — the install step is missing or the version is unresolvable.`,
            'Run the package manager install (`npm install` / `yarn` / `pnpm install`) so the lockfile matches the manifest.'
          )
        )
      }
    }
    if (addedDeps.length > 0 && !LOCKFILES.some(l => paths.has(l))) {
      findings.push(
        issue(
          'dep-lockfile-missing',
          'dependencies',
          'warning',
          'package.json',
          0,
          `${addedDeps.length} dependenc${addedDeps.length === 1 ? 'y' : 'ies'} added without a lockfile change.`,
          'Commit the updated lockfile so installs are reproducible across the team and CI.'
        )
      )
    }
  }

  const lockChanged = changed.some(f => LOCKFILES.includes(f.path))
  if (lockChanged && !paths.has('package.json')) {
    findings.push(
      issue(
        'lockfile-only-change',
        'dependencies',
        'warning',
        changed.find(f => LOCKFILES.includes(f.path))?.path ?? 'package-lock.json',
        0,
        'Lockfile changed without a matching package.json change — the manifest and lockfile are out of sync.',
        'If the dependency change is intentional, update package.json too; otherwise revert the lockfile drift.'
      )
    )
  }

  return findings.slice(0, MAX_PER_DIMENSION)
}

/** Security: secrets on added lines (reusing the committed scanSecrets). */
export function checkSecurity(root: string, changed: PrChangedFile[]): PrReviewIssue[] {
  const findings: PrReviewIssue[] = []
  for (const f of changed) {
    if (!/\.(ts|tsx|js|jsx|mjs|cjs|json|plist|gradle|properties|yaml|yml|toml|ini)$/.test(f.path)) continue
    const content = readFile(root, f.path)
    if (content === null) continue
    const added = addedLineSet(f)
    for (const s of scanSecrets(f.path, content)) {
      if (!added.has(s.line)) continue
      findings.push(
        issue(
          s.id,
          'security',
          s.severity,
          f.path,
          s.line,
          s.message,
          s.suggestion
        )
      )
    }
    // Plain-HTTP fetches on added lines — easy wins for a PR review.
    for (const line of f.addedLines) {
      if (/fetch\(\s*['"]http:\/\//.test(line.text)) {
        findings.push(
          issue(
            'insecure-http',
            'security',
            'warning',
            f.path,
            line.line,
            'Added an HTTP (non-TLS) fetch — cleartext traffic can be read or modified in transit.',
            'Use https:// URLs (or the platform network config) so requests are encrypted.'
          )
        )
      }
    }
  }
  return findings.slice(0, MAX_PER_DIMENSION)
}

/** Performance: re-render/startup/bridge hazards on added lines. */
export function checkPerformance(root: string, changed: PrChangedFile[]): PrReviewIssue[] {
  const findings: PrReviewIssue[] = []
  for (const f of changed) {
    if (!/\.(ts|tsx|js|jsx)$/.test(f.path)) continue
    const content = readFile(root, f.path)
    if (content === null) continue
    const added = addedLineSet(f)
    const scanned = [
      ...scanRenderHazards(content, f.path),
      ...scanStartupHazards(content, f.path),
      ...scanBridgeHazards(content, f.path),
    ]
    for (const p of scanned) {
      if (!added.has(p.line)) continue
      findings.push(
        issue(
          p.id,
          'performance',
          p.severity,
          p.file,
          p.line,
          p.message,
          p.suggestion
        )
      )
    }
  }
  return findings.slice(0, MAX_PER_DIMENSION)
}

const CONFIG_FILES = /(^|\/)(babel\.config|metro\.config|jest\.config|react-native\.config|tsconfig[^/]*|app\.json|package\.json|eslint[^/]*|prettier[^/]*|\.eslintrc[^/]*|index\.(ts|js))$/i
const TEST_FILE = /\.(test|spec)\.(ts|tsx|js|jsx)$/i

function hasSiblingTest(root: string, path: string): boolean {
  const base = dirname(path)
  const stem = path.slice(base.length + 1).replace(/\.[jt]sx?$/, '')
  const candidates: string[] = []
  for (const ext of ['ts', 'tsx', 'js', 'jsx']) {
    candidates.push(join(base, `${stem}.test.${ext}`))
    candidates.push(join(base, `${stem}.spec.${ext}`))
    candidates.push(join(base, '__tests__', `${stem}.test.${ext}`))
    candidates.push(join(base, '__tests__', `${stem}.${ext}`))
  }
  return candidates.some(c => existsSync(join(root, c)))
}

/** Testing: every changed source file should carry a test. */
export function checkTesting(root: string, changed: PrChangedFile[]): PrReviewIssue[] {
  const findings: PrReviewIssue[] = []
  for (const f of changed) {
    const path = f.path
    if (!/\.(ts|tsx|js|jsx)$/.test(path)) continue
    if (TEST_FILE.test(path) || path.includes('__tests__')) continue
    if (CONFIG_FILES.test(path)) continue
    if (path.includes('/android/') || path.includes('/ios/')) continue
    if (hasSiblingTest(root, path)) continue
    findings.push(
      issue(
        'no-test-coverage',
        'testing',
        'warning',
        path,
        0,
        `Changed source file ${path} has no test file.`,
        'Add a sibling test (`X.test.ts(x)`) or a `__tests__/` case covering the changed behavior.'
      )
    )
  }
  return findings.slice(0, MAX_PER_DIMENSION)
}

/** Run all five checks over the parsed diff. */
export function runChecks(root: string, changed: PrChangedFile[]): PrReviewIssue[] {
  return [
    ...checkArchitecture(root, changed),
    ...checkDependencies(root, changed),
    ...checkSecurity(root, changed),
    ...checkPerformance(root, changed),
    ...checkTesting(root, changed),
  ]
}
