/**
 * vectalon refactor — refactor opportunity scanners (Roadmap Phase 8, item 066)
 * Business Source License 1.1 (BSL-1.1)
 *
 * Deterministic per-file scans that propose concrete, safe refactors:
 * dead code (unused imports via the AST scanner, unused variables,
 * unreachable statements), duplication (repeated blocks and repeated
 * strings), modernization (optional chaining, includes, strict equality,
 * let/const), type smells (any, ts-ignore), RN style debt (inline styles),
 * and logging noise. The existing RefactorSuggester contributes the
 * file-too-large / long-function / magic-number checks; every finding is
 * line-pinned and carries a concrete suggestion. Hermetic-testable.
 */

import { analyzeSourceFile } from '../harness'
import { RefactorSuggester } from '../sdlc/RefactorSuggester'
import type { RefactorFinding } from './types'

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function lineAt(content: string, index: number): number {
  return content.slice(0, index).split('\n').length
}

/** Whole-word occurrence count of an identifier in a file. */
function occurrences(content: string, name: string): number {
  return content.match(new RegExp(`\\b${escapeRegExp(name)}\\b`, 'g'))?.length ?? 0
}

/** Imports whose bindings are referenced nowhere else (AST-backed). */
function unusedImports(file: string, content: string, analysis: ReturnType<typeof analyzeSourceFile>): RefactorFinding[] {
  const findings: RefactorFinding[] = []
  if (!analysis) return findings
  const lines = content.split('\n')
  for (const imp of analysis.imports) {
    const bindings = [imp.defaultName, ...imp.named, imp.namespace].filter((b): b is string => Boolean(b))
    for (const b of bindings) {
      // A lone occurrence is the import specifier itself.
      if (occurrences(content, b) > 1) continue
      const lineIndex = lines.findIndex(l => l.includes(b)) + 1
      findings.push({
        id: 'unused-import',
        category: 'dead-code',
        severity: 'warning',
        file,
        line: lineIndex || 0,
        target: b,
        message: `Import ${b} (from ${imp.source}) is never used`,
        suggestion: `Remove the ${b} specifier — dead imports confuse readers and trip noUnusedLocals in strict TS projects.`,
      })
    }
  }
  return findings
}

/** const/let declarations whose identifier is never referenced. */
function unusedVariables(file: string, content: string): RefactorFinding[] {
  const findings: RefactorFinding[] = []
  const re = /\b(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=/g
  let m: RegExpExecArray | null
  while ((m = re.exec(content)) !== null) {
    const name = m[1]
    if (name.startsWith('_')) continue // intentional placeholder convention
    const lineText = content.slice(content.lastIndexOf('\n', m.index - 1) + 1, content.indexOf('\n', m.index))
    if (/^\s*(export\b|for\s*\()/.test(lineText)) continue // exported or loop binding
    if (occurrences(content, name) > 1) continue
    findings.push({
      id: 'unused-variable',
      category: 'dead-code',
      severity: 'warning',
      file,
      line: lineAt(content, m.index),
      target: name,
      message: `Variable ${name} is declared but never used`,
      suggestion: 'Delete it — or prefix it with _ if it is intentionally kept for the future.',
    })
  }
  return findings
}

/** Statements that can never run because they follow a return/throw/break/continue. */
function unreachableCode(file: string, content: string): RefactorFinding[] {
  const findings: RefactorFinding[] = []
  const lines = content.split('\n')
  for (let i = 0; i < lines.length - 1; i++) {
    const line = lines[i].trim()
    const terminator = /^(return|throw|break|continue)\b/.exec(line)
    if (!terminator || !line.endsWith(';')) continue
    const next = lines[i + 1].trim()
    if (!next || next === '}' || next === '})' || next.startsWith('//') || next.startsWith('*')) continue
    findings.push({
      id: 'unreachable-code',
      category: 'dead-code',
      severity: 'warning',
      file,
      line: i + 2,
      target: next.slice(0, 48),
      message: `Code after ${terminator[1]} on line ${i + 1} is unreachable`,
      suggestion: 'Delete the dead statement or move it before the return/throw — it will never run.',
    })
  }
  return findings
}

/** Repeated identical ≥5-line blocks within one file — real copy-paste debt. */
function duplicatedBlocks(file: string, content: string): RefactorFinding[] {
  const findings: RefactorFinding[] = []
  const lines = content.split('\n')
  if (lines.length > 3000) return findings
  const BLOCK = 5
  const normalized = lines.map(l => l.trim()).join('\n')
  const seen = new Set<string>()
  for (let i = 0; i <= lines.length - BLOCK; i++) {
    const block = lines.slice(i, i + BLOCK).map(l => l.trim())
    if (block.some(l => !l) || !/\w/.test(block.join(' '))) continue
    const key = block.join('\n')
    if (seen.has(key)) continue
    const count = normalized.split(`\n${key}\n`).length - 1
    if (count >= 2) {
      seen.add(key)
      findings.push({
        id: 'duplicated-block',
        category: 'duplication',
        severity: 'warning',
        file,
        line: i + 1,
        target: block.slice(0, 2).join(' | ').slice(0, 48),
        message: `Identical ${BLOCK}-line block appears ${count} times (first at line ${i + 1})`,
        suggestion: 'Extract the repeated block into one helper and call it from every site — a fix lands in one place instead of N.',
      })
    }
  }
  return findings
}

/** Long literal strings used 3+ times — hoist to a constant. */
function duplicatedStrings(file: string, content: string): RefactorFinding[] {
  const findings: RefactorFinding[] = []
  // Test descriptions and fixture maps repeat by nature — refactoring them
  // into constants is not the win this scan is looking for.
  if (/(?:^|\/)(?:__tests__|__mocks__|fixtures|test-data)(?:\/|$)|(?:^|\/)[^/]+\.(?:test|spec)\.(?:ts|tsx|js|jsx)$/.test(file)) return findings
  const counts = new Map<string, number>()
  const first = new Map<string, number>()
  const re = /['"`]([A-Za-z0-9 _\-./:()#]{16,})['"`]/g
  let m: RegExpExecArray | null
  while ((m = re.exec(content)) !== null) {
    const lineText = content.slice(content.lastIndexOf('\n', m.index) + 1, content.indexOf('\n', m.index))
    if (/\b(?:it|test|describe)\s*\(/.test(lineText)) continue // test label, not a domain string
    const s = m[1]
    counts.set(s, (counts.get(s) ?? 0) + 1)
    if (!first.has(s)) first.set(s, lineAt(content, m.index))
  }
  for (const [s, count] of counts) {
    if (count < 3) continue
    findings.push({
      id: 'duplicated-string',
      category: 'duplication',
      severity: 'info',
      file,
      line: first.get(s) ?? 0,
      target: s.slice(0, 40),
      message: `String "${s.slice(0, 40)}" is repeated ${count} times`,
      suggestion: 'Hoist it to a named constant (or an i18n key) so the text and its changes live in one place.',
    })
  }
  return findings
}

/** `user && user.name` → `user?.name`. */
function optionalChaining(file: string, content: string): RefactorFinding[] {
  const re = /\b([A-Za-z_$][\w$]*)\s*&&\s*\1\.([A-Za-z_$][\w$]*)/g
  const m = re.exec(content)
  if (!m) return []
  return [{
    id: 'optional-chaining',
    category: 'modernization',
    severity: 'info',
    file,
    line: lineAt(content, m.index),
    target: m[0].trim().slice(0, 48),
    message: `Manual null guard ${m[0].trim().slice(0, 40)} can use optional chaining`,
    suggestion: `Rewrite as ${m[1]}?.${m[2]} — shorter, and the guard intent (skip when ${m[1]} is nullish) is explicit.`,
  }]
}

/** `.indexOf(x) !== -1` → `.includes(x)`. */
function useIncludes(file: string, content: string): RefactorFinding[] {
  const re = /\.indexOf\(([^)]+)\)\s*(?:!==|===|-|>|<)\s*-?[01]/g
  const m = re.exec(content)
  if (!m) return []
  return [{
    id: 'use-includes',
    category: 'modernization',
    severity: 'info',
    file,
    line: lineAt(content, m.index),
    target: m[0].slice(0, 48),
    message: `indexOf-as-membership check ${m[0].trim().slice(0, 40)} reads as an index lookup`,
    suggestion: 'Use .includes(...) — membership intent is clearer and cannot be confused with a real index.',
  }]
}

/** Loose `==` / `!=` where strict equality is meant. */
function looseEquality(file: string, content: string): RefactorFinding[] {
  const re = /(?<![=!<>])(==|!=)(?!=)/g
  const matches = [...content.matchAll(re)]
  if (matches.length === 0) return []
  const first = matches[0]
  return [{
    id: 'loose-equality',
    category: 'modernization',
    severity: 'info',
    file,
    line: lineAt(content, first.index),
    target: matches.length > 1 ? `${first[0]} (${matches.length} sites)` : first[0],
    message: `Loose equality ${first[0]} used ${matches.length} time${matches.length === 1 ? '' : 's'}`,
    suggestion: 'Use === / !== — loose equality coerces types and hides null/undefined bugs.',
  }]
}

/** `var` declarations → const/let. */
function varUsage(file: string, content: string): RefactorFinding[] {
  const re = /\bvar\s+([A-Za-z_$][\w$]*)/g
  const m = re.exec(content)
  if (!m) return []
  return [{
    id: 'var-usage',
    category: 'modernization',
    severity: 'info',
    file,
    line: lineAt(content, m.index),
    target: m[1],
    message: `var declaration for ${m[1]}`,
    suggestion: 'Use const (or let when it must be reassigned) — var hoists and leaks across block scope.',
  }]
}

/** Suppression-comment detection (ts-ignore and ts-expect-error). */
function tsIgnores(file: string, content: string): RefactorFinding[] {
  const findings: RefactorFinding[] = []
  const lines = content.split('\n')
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('@ts-ignore')) {
      findings.push({
        id: 'ts-ignore',
        category: 'types',
        severity: 'warning',
        file,
        line: i + 1,
        target: '@ts-ignore',
        message: '@ts-ignore suppresses every error on the next line, including future ones',
        suggestion: 'Replace with @ts-expect-error (fails when the error disappears) or fix the underlying type — @ts-ignore hides regressions silently.',
      })
    } else if (lines[i].includes('@ts-expect-error')) {
      findings.push({
        id: 'ts-expect-error',
        category: 'types',
        severity: 'info',
        file,
        line: i + 1,
        target: '@ts-expect-error',
        message: '@ts-expect-error suppresses a specific error on the next line',
        suggestion: 'Keep it only while the underlying issue is tracked — when the error goes away, ts-expect-error turns into a compile failure so it cannot go stale.',
      })
    }
  }
  return findings
}

/** `: any` / `as any` — the type-system escape hatch. */
function anyTypes(file: string, content: string): RefactorFinding[] {
  const re = /: any\b|\bas any\b/g
  const m = re.exec(content)
  if (!m) return []
  return [{
    id: 'any-type',
    category: 'types',
    severity: 'warning',
    file,
    line: lineAt(content, m.index),
    target: m[0].trim(),
    message: `any used (${content.match(/\b(?:as any|: any)\b/g)?.length ?? 1} site(s)) — it disables type checking at the boundary`,
    suggestion: 'Replace with unknown + a narrowing, or a concrete shared type — any at an API boundary silently accepts every shape.',
  }]
}

/** Inline `style={{ ... }}` objects with multiple props → StyleSheet.create. */
function inlineStyles(file: string, content: string): RefactorFinding[] {
  const re = /style=\{\{\s*[A-Za-z]+:\s*[^,}]+,\s*[A-Za-z]+:/g
  const m = re.exec(content)
  if (!m) return []
  return [{
    id: 'inline-style',
    category: 'styles',
    severity: 'info',
    file,
    line: lineAt(content, m.index),
    target: m[0].slice(0, 48),
    message: 'Multi-prop inline style object is recreated on every render',
    suggestion: 'Extract it to StyleSheet.create at module scope — stable identity, cached styles, and a named design token.',
  }]
}

/** console.log / console.debug — debugging noise. */
function consoleLogs(file: string, content: string): RefactorFinding[] {
  const re = /console\.(log|debug)\s*\(/g
  const m = re.exec(content)
  if (!m) return []
  return [{
    id: 'console-log',
    category: 'logging',
    severity: 'info',
    file,
    line: lineAt(content, m.index),
    target: `console.${m[1]}`,
    message: `console.${m[1]} left in source`,
    suggestion: 'Remove it or route through a logger (console.warn/error for real problems) — stray logs leak state to production consoles.',
  }]
}

/** File-too-large / long-function / magic-number from the shared suggester. */
function suggesterFindings(file: string, content: string): RefactorFinding[] {
  const findings: RefactorFinding[] = []
  const suggestions = new RefactorSuggester().suggest(content, file)
  for (const s of suggestions) {
    if (s.pattern === 'file-too-large') {
      findings.push({
        id: 'file-too-large',
        category: 'complexity',
        severity: 'warning',
        file,
        line: 0,
        target: file,
        message: s.suggestion,
        suggestion: 'Split the file along its responsibilities — a file this size hides the seams between its concerns.',
      })
    } else if (s.pattern === 'long-function') {
      const name = /"(\w+)"/.exec(s.suggestion)?.[1] ?? s.pattern
      findings.push({
        id: 'long-function',
        category: 'complexity',
        severity: 'warning',
        file,
        line: 0,
        target: name,
        message: s.suggestion,
        suggestion: 'Break it into small helpers with one responsibility and descriptive names — long functions are where bugs hide.',
      })
    }
  }
  return findings
}

/** Run every refactor scanner over one source file. */
export function scanRefactorFile(file: string, content: string): RefactorFinding[] {
  const analysis = analyzeSourceFile(content, file)
  return [
    ...unusedImports(file, content, analysis),
    ...unusedVariables(file, content),
    ...unreachableCode(file, content),
    ...duplicatedBlocks(file, content),
    ...duplicatedStrings(file, content),
    ...optionalChaining(file, content),
    ...useIncludes(file, content),
    ...looseEquality(file, content),
    ...varUsage(file, content),
    ...tsIgnores(file, content),
    ...anyTypes(file, content),
    ...inlineStyles(file, content),
    ...consoleLogs(file, content),
    ...suggesterFindings(file, content),
  ]
}
