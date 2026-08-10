/**
 * rn-diff-purge integration — authoritative CLI-app upgrade diffs
 * Business Source License 1.1 (BSL-1.1)
 *
 * react-native-community/rn-diff-purge maintains one git branch per React
 * Native release (`release/<version>`), each generated from a fresh
 * `react-native init`, and publishes a pre-generated unified diff for every
 * from→to pair on its `diffs` branch:
 *
 *   https://raw.githubusercontent.com/react-native-community/rn-diff-purge/diffs/diffs/<from>..<to>.diff
 *
 * This is the exact data the official Upgrade Helper
 * (https://react-native-community.github.io/upgrade-helper/) displays. Vectalon
 * fetches it live so the template changes are always current — even for
 * releases newer than the local catalog tables — and classifies every changed
 * file as native (android/, ios/), JS/TS (App.tsx, index.js, babel/metro/ts
 * config, package.json), or other, so an upgrade plan always surfaces both the
 * native and the JS/TS work to apply.
 */

/** How a changed template file is grouped for the plan. */
export type RnDiffBucket = 'native' | 'js-ts' | 'other'

export type RnDiffFileStatus = 'added' | 'removed' | 'modified' | 'renamed'

export interface RnDiffFileChange {
  /** Path relative to the project root (the RnDiffApp/ prefix is stripped). */
  path: string
  status: RnDiffFileStatus
  bucket: RnDiffBucket
  additions: number
  deletions: number
  /** Previous path for renames. */
  oldPath?: string
}

export interface RnDiffBucketSummary {
  fileCount: number
  additions: number
  deletions: number
  files: RnDiffFileChange[]
}

export interface RnDiffPurgeSummary {
  source: 'rn-diff-purge'
  /** The raw diff URL this summary came from (empty when parsed offline without versions). */
  url: string
  from: string
  to: string
  totalFiles: number
  totalAdditions: number
  totalDeletions: number
  /** Native changes (android/, ios/, Gemfile, *.podspec). */
  native: RnDiffBucketSummary
  /** JS/TS + app-manifest changes (App.tsx, index.js, babel/metro/ts config, package.json). */
  jsTs: RnDiffBucketSummary
  /** Everything else (README, .gitignore, docs, …). */
  other: RnDiffBucketSummary
  /** The interactive Upgrade Helper URL for the same pair. */
  upgradeHelperUrl: string
}

const REPO = 'react-native-community/rn-diff-purge'
const DIFF_BRANCH = 'diffs'
const DIFF_DIR = 'diffs'
const APP_PREFIX = 'RnDiffApp/'

/** The raw unified-diff URL for a from→to pair (same data the Upgrade Helper uses). */
export function rnDiffPurgeUrl(from: string, to: string): string {
  return `https://raw.githubusercontent.com/${REPO}/${DIFF_BRANCH}/${DIFF_DIR}/${from}..${to}.diff`
}

/** The interactive Upgrade Helper URL for a from→to pair. */
export function upgradeHelperUrl(from: string, to: string): string {
  return `https://react-native-community.github.io/upgrade-helper/?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
}

const NATIVE_DIR_RE = /^(android|ios)\//
const NATIVE_BASENAMES = new Set(['Gemfile', 'react-native.config.js', 'react-native.config.ts'])
const JS_TS_EXT_RE = /\.(js|jsx|ts|tsx|mjs|cjs|json|graphql|gql)$/
const JS_TS_BASENAMES = new Set([
  'package.json',
  'App.tsx',
  'App.js',
  'index.js',
  'index.ts',
  'index.tsx',
  'metro.config.js',
  'metro.config.ts',
  'babel.config.js',
  'babel.config.cjs',
  'tsconfig.json',
  'jest.config.js',
  '.eslintrc.js',
  '.prettierrc.js',
  '.watchmanconfig',
])

/**
 * Classify a template file path into the native (android/, ios/) vs JS/TS
 * (app code + JS toolchain config) vs other bucket. Used to keep every
 * upgrade plan aware of both the native and the JS/TS changes to apply.
 */
export function classifyRnDiffPath(path: string): RnDiffBucket {
  const normalized = path.replace(/^RnDiffApp\//, '')
  if (NATIVE_DIR_RE.test(normalized) || NATIVE_BASENAMES.has(normalized) || normalized.endsWith('.podspec')) {
    return 'native'
  }
  if (JS_TS_EXT_RE.test(normalized) || JS_TS_BASENAMES.has(normalized)) {
    return 'js-ts'
  }
  return 'other'
}

function stripAppPrefix(path: string): string {
  return path.startsWith(APP_PREFIX) ? path.slice(APP_PREFIX.length) : path
}

/** Parse one `diff --git` section into a file change (null when malformed). */
function parseDiffSection(section: string[]): RnDiffFileChange | null {
  const header = section[0]
  const match = header.match(/^diff --git a\/(.*) b\/(.*)$/)
  if (!match) return null
  let oldPath = match[1].trim()
  let newPath = match[2].trim()
  let status: RnDiffFileStatus = 'modified'
  let additions = 0
  let deletions = 0
  let renamedFrom: string | null = null
  let renamedTo: string | null = null

  for (const line of section.slice(1)) {
    if (/^new file mode/.test(line)) status = 'added'
    else if (/^deleted file mode/.test(line)) status = 'removed'
    else if (/^similarity index/.test(line)) status = 'renamed'
    else if (/^rename from (.+)/.test(line)) renamedFrom = line.replace(/^rename from /, '')
    else if (/^rename to (.+)/.test(line)) renamedTo = line.replace(/^rename to /, '')
    // /dev/null sides pin added/removed (covers diffs without mode headers).
    else if (/^--- \/dev\/null/.test(line)) status = 'added'
    else if (/^\+\+\+ \/dev\/null/.test(line)) status = 'removed'
    // Skip the `--- a/…` / `+++ b/…` header shapes without touching status,
    // so modified files stay 'modified'. Content that itself starts with
    // `---`/`+++` (e.g. a removed markdown rule) is still counted.
    else if (/^--- a\//.test(line) || /^\+\+\+ b\//.test(line)) continue
    // Git binary patches carry base85 data whose lines can start with +/-;
    // never count those (the real rn-diff-purge data emits `Binary files …
    // differ` today — this is cheap insurance).
    else if (/^GIT binary patch/.test(line) || /^literal \d+/.test(line) || /^delta \d+/.test(line)) continue
    else if (/^\+/.test(line)) additions += 1
    else if (/^-/.test(line)) deletions += 1
  }

  if (renamedTo) newPath = renamedTo
  if (renamedFrom) oldPath = renamedFrom

  const path = stripAppPrefix(newPath)
  return {
    path,
    status,
    bucket: classifyRnDiffPath(path),
    additions,
    deletions,
    ...(status === 'renamed' && oldPath !== newPath ? { oldPath: stripAppPrefix(oldPath) } : {}),
  }
}

/** Parse a unified diff body into file changes (RnDiffApp/ prefix stripped). */
export function parseRnDiffFiles(content: string): RnDiffFileChange[] {
  const files: RnDiffFileChange[] = []
  const lines = content.split(/\r?\n/)
  let i = 0
  while (i < lines.length) {
    if (!lines[i].startsWith('diff --git ')) {
      i += 1
      continue
    }
    const section: string[] = [lines[i]]
    i += 1
    while (i < lines.length && !lines[i].startsWith('diff --git ')) {
      section.push(lines[i])
      i += 1
    }
    const change = parseDiffSection(section)
    if (change) files.push(change)
  }
  return files
}

/** Build the categorized summary for a set of parsed file changes. */
export function summarizeRnDiff(files: RnDiffFileChange[], from: string, to: string): RnDiffPurgeSummary {
  const bucket = (bucket: RnDiffBucket): RnDiffBucketSummary => {
    const list = files.filter(f => f.bucket === bucket)
    return {
      fileCount: list.length,
      additions: list.reduce((sum, f) => sum + f.additions, 0),
      deletions: list.reduce((sum, f) => sum + f.deletions, 0),
      files: list,
    }
  }
  return {
    source: 'rn-diff-purge',
    url: from && to ? rnDiffPurgeUrl(from, to) : '',
    from,
    to,
    totalFiles: files.length,
    totalAdditions: files.reduce((sum, f) => sum + f.additions, 0),
    totalDeletions: files.reduce((sum, f) => sum + f.deletions, 0),
    native: bucket('native'),
    jsTs: bucket('js-ts'),
    other: bucket('other'),
    upgradeHelperUrl: from && to ? upgradeHelperUrl(from, to) : '',
  }
}

/** Parse a raw unified diff into a categorized summary. */
export function parseRnDiff(content: string, from: string, to: string): RnDiffPurgeSummary {
  return summarizeRnDiff(parseRnDiffFiles(content), from, to)
}

export interface RnDiffFetchOptions {
  /** Injectable fetcher (tests stub this); defaults to global fetch. */
  fetch?: typeof globalThis.fetch
  /** Wall-clock timeout in ms (default 15000). */
  timeoutMs?: number
}

/**
 * Fetch the rn-diff-purge diff for a from→to pair and summarize it. Always
 * current — the diffs branch tracks every published release, including RCs —
 * and never cached locally, so a brand-new RN release is visible immediately.
 */
export async function fetchRnDiffPurge(from: string, to: string, options: RnDiffFetchOptions = {}): Promise<RnDiffPurgeSummary> {
  const url = rnDiffPurgeUrl(from, to)
  const timeoutMs = options.timeoutMs ?? 15000
  const fetcher = options.fetch || globalThis.fetch
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetcher(url, { signal: controller.signal })
    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(`No rn-diff-purge diff published for ${from} → ${to} yet (template diffs lag releases by a few days). Try ${upgradeHelperUrl(from, to)} or a slightly older "to" version.`)
      }
      throw new Error(`rn-diff-purge fetch failed (HTTP ${response.status})`)
    }
    const content = await response.text()
    return parseRnDiff(content, from, to)
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(`rn-diff-purge fetch timed out after ${timeoutMs}ms — check your network and retry.`)
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}

/** One-line-per-file rendering of the categorized diff (for CLI output). */
export function renderRnDiffSummary(summary: RnDiffPurgeSummary): string {
  const lines: string[] = []
  const fileLine = (f: RnDiffFileChange): string =>
    `  - ${f.path} (${f.status}${f.additions + f.deletions > 0 ? `, +${f.additions} −${f.deletions}` : ''}${f.oldPath ? ` from ${f.oldPath}` : ''})`

  lines.push(`rn-diff-purge ${summary.from} → ${summary.to} — ${summary.totalFiles} template file(s) changed (+${summary.totalAdditions} −${summary.totalDeletions})`)
  lines.push('')
  lines.push(`Native (android/, ios/) — ${summary.native.fileCount} file(s) (+${summary.native.additions} −${summary.native.deletions})`)
  for (const f of summary.native.files) lines.push(fileLine(f))
  lines.push('')
  lines.push(`JS/TS — ${summary.jsTs.fileCount} file(s) (+${summary.jsTs.additions} −${summary.jsTs.deletions})`)
  for (const f of summary.jsTs.files) lines.push(fileLine(f))
  if (summary.other.fileCount > 0) {
    lines.push('')
    lines.push(`Other — ${summary.other.fileCount} file(s)`)
    for (const f of summary.other.files) lines.push(fileLine(f))
  }
  if (summary.upgradeHelperUrl) {
    lines.push('')
    lines.push(`Interactive diff: ${summary.upgradeHelperUrl}`)
  }
  return lines.join('\n')
}
