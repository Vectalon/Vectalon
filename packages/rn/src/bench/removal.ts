/**
 * Phase V-5 benchmark — dependency-removal generate seam.
 *
 * Removal scenarios (e.g. rn-11 "Remove a dependency with full native
 * cleanup") ask the generator to *delete* a package and its native traces —
 * the inverse of the add-feature scaffold. `deterministicGenerate` has no
 * branch for that, so removal scenarios previously produced zero files and
 * scored n/a on every axis (correctness is intentionally disabled for them:
 * you cannot typecheck a deletion).
 *
 * This seam applies `scenario.removedDependencies` to the fixture files and
 * emits the changed files with complete new content:
 *   - package.json  — drop the package (and `${name}-*` companion packages)
 *                     from dependencies/devDependencies/optional/peer;
 *   - native config — strip every line (outside comments) that references the
 *                     package's native tokens from Podfile, gradle/kts,
 *                     AndroidManifest.xml, Info.plist, pbxproj, xcconfig,
 *                     Podfile.lock — whole XML elements for the manifest so a
 *                     multi-line <provider> cannot leave an orphaned fragment.
 *
 * The emitted files are scored by the same rubric that scores the human
 * reference (adherence includes the `no-removed-native-traces` check when
 * `removedDependencies` is declared) plus the guardrails pass, so rn-11 gets
 * a real adherence + guardrails composite instead of n/a. Deterministic —
 * no model calls.
 */

import { isReferenceLine, nativePackageTokens } from '../utils/nativeScan'
import { isNativeConfigFile } from './rubric'
import type { BenchGeneratedFile, BenchScenario } from './types'

/** True when the scenario removes one or more dependencies. */
export function isRemovalScenario(scenario: BenchScenario): boolean {
  return (scenario.removedDependencies?.length ?? 0) > 0
}

/** Drop the package (and companion `${name}-*` packages) from package.json. */
function removeFromPackageJson(content: string, deps: string[]): string {
  let pkg: Record<string, Record<string, string> | undefined>
  try {
    pkg = JSON.parse(content) as Record<string, Record<string, string> | undefined>
  } catch {
    return content
  }
  const names = new Set<string>(deps)
  // Companion packages (appcenter → appcenter-analytics) ride along: removing
  // a suite means removing the suite, not leaving a half-package behind.
  for (const dep of deps) {
    for (const section of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
      const map = pkg[section]
      if (!map) continue
      for (const name of Object.keys(map)) {
        if (name.startsWith(`${dep}-`)) names.add(name)
      }
    }
  }
  let changed = false
  for (const section of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
    const map = pkg[section]
    if (!map) continue
    for (const name of Object.keys(map)) {
      if (names.has(name)) {
        delete map[name]
        changed = true
      }
    }
    if (Object.keys(map).length === 0) {
      delete pkg[section]
      changed = true
    }
  }
  return changed ? `${JSON.stringify(pkg, null, 2)}\n` : content
}

/** Per-line block-comment mask (slash-star and `<!-- -->`), mirroring the rubric. */
function blockCommentMask(lines: string[]): boolean[] {
  const mask = new Array<boolean>(lines.length).fill(false)
  let inBlock = false
  lines.forEach((line, i) => {
    const trimmed = line.trim()
    if (inBlock) {
      mask[i] = true
      if (/\*\/\s*$/.test(trimmed) || /-->\s*$/.test(trimmed)) inBlock = false
    } else if (
      (/^\/\*/.test(trimmed) && !/\*\/\s*$/.test(trimmed)) ||
      (/^<!--/.test(trimmed) && !/-->\s*$/.test(trimmed))
    ) {
      mask[i] = true
      inBlock = true
    }
  })
  return mask
}

/** Strip reference lines from a non-XML native config file (Podfile, gradle,
 * plist, pbxproj, xcconfig, Podfile.lock), skipping comment/blank lines. */
function stripNativeLines(content: string, tokens: string[]): string {
  const lines = content.split('\n')
  const inComment = blockCommentMask(lines)
  const kept = lines.filter((line, i) => {
    if (inComment[i]) return true
    const trimmed = line.trim()
    if (!trimmed || /^(?:\/\/|\*|\/\*|#|<!--)/.test(trimmed)) return true
    return !isReferenceLine(line, tokens)
  })
  return kept.join('\n')
}

interface XmlElem {
  tag: string
  lines: string[]
  ref: boolean
}

/**
 * Strip XML elements that reference the removed package (AndroidManifest
 * providers, activities, etc.). Element-aware so a multi-line
 * `<provider ...>` cannot leave an orphaned `<provider` fragment behind:
 * the whole element — open tag through close — is dropped when any of its
 * lines references the package tokens.
 */
function stripXmlElements(content: string, tokens: string[]): string {
  const lines = content.split('\n')
  const inComment = blockCommentMask(lines)
  const out: string[] = []
  const stack: XmlElem[] = []

  const emit = (line: string, ref?: boolean): void => {
    if (stack.length > 0) {
      const top = stack[stack.length - 1]
      top.lines.push(line)
      if (ref) top.ref = true
    } else {
      out.push(line)
    }
  }
  const closeElem = (e: XmlElem): void => {
    if (e.ref) return // element references the removed package — drop entirely
    if (stack.length > 0) stack[stack.length - 1].lines.push(...e.lines)
    else out.push(...e.lines)
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (inComment[i]) {
      emit(line)
      continue
    }
    const trimmed = line.trim()
    const openTag = trimmed.match(/<([A-Za-z][\w:.-]*)\b/)
    const closeTag = trimmed.match(/<\/([A-Za-z][\w:.-]*)\s*>/)
    const refLine = isReferenceLine(line, tokens)
    const selfClosing = /\/\s*>/.test(trimmed)
    const isClosing = closeTag !== null

    if (openTag && !isClosing && !selfClosing) {
      // Opening tag of an element — buffer from here (even if the open tag
      // and its content share this line, e.g. `<application android:label="x">`).
      stack.push({ tag: openTag[1], lines: [line], ref: refLine })
    } else if (openTag && isClosing) {
      // `<a>...</a>` on one line.
      const e: XmlElem = { tag: openTag[1], lines: [line], ref: refLine }
      closeElem(e)
    } else if (openTag && selfClosing) {
      // Self-contained element: `<provider ... />` — open and close in one.
      const e: XmlElem = { tag: openTag[1], lines: [line], ref: refLine }
      closeElem(e)
    } else if (isClosing && stack.length > 0) {
      const top = stack.pop() as XmlElem
      top.lines.push(line)
      if (refLine) top.ref = true
      closeElem(top)
    } else if (selfClosing && stack.length > 0) {
      // A standalone `/>` closes the element opened on an earlier line
      // (multi-line self-closing element).
      const top = stack.pop() as XmlElem
      top.lines.push(line)
      if (refLine) top.ref = true
      closeElem(top)
    } else {
      // Plain content line — attach to the open element; a reference here
      // marks the whole element for removal (e.g. a multi-line <provider>
      // whose android:name attribute references the package).
      emit(line, refLine)
    }
  }
  // Unclosed elements at EOF (malformed input) — keep their content.
  for (const e of stack) closeElem(e)
  return out.join('\n')
}

/**
 * Apply `removedDependencies` to the scenario fixtures and return the changed
 * files (path + complete new content). Files the removal does not touch are
 * omitted — like the scaffold, only the deltas are emitted.
 */
export function removalGenerate(scenario: BenchScenario): BenchGeneratedFile[] {
  const deps = scenario.removedDependencies || []
  if (deps.length === 0) return []
  const tokens = deps.flatMap(nativePackageTokens)
  const changed: BenchGeneratedFile[] = []

  for (const [path, content] of Object.entries(scenario.fixtures || {})) {
    if (path === 'package.json') {
      const next = removeFromPackageJson(content, deps)
      if (next !== content) changed.push({ path, content: next })
    } else if (isNativeConfigFile(path)) {
      const next = /\.xml$/.test(path) ? stripXmlElements(content, tokens) : stripNativeLines(content, tokens)
      if (next !== content) changed.push({ path, content: next })
    }
  }
  return changed
}
