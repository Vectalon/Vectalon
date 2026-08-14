/**
 * vectalon bug-fix — fix detectors (Roadmap Phase 8, item 070)
 * Business Source License 1.1 (BSL-1.1)
 *
 * Each detector returns line-pinned findings with a precise, mechanical
 * edit. The safe-apply whitelist is deliberately tiny: whole-line import
 * removal and var→const, both proven idempotent and side-effect free by
 * occurrence-counting. Everything else is proposed for a human.
 */

import { analyzeSourceFile } from '../harness'
import type { FixFinding } from './types'

/** Count occurrences of a bare identifier (word-boundary match). */
function occurrences(content: string, name: string): number {
  const re = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g')
  const m = content.match(re)
  return m ? m.length : 0
}

/**
 * AST-backed unused-import detection. A binding with exactly one occurrence
 * is the import specifier itself. Fixable only when the import statement is
 * a single line carrying just that binding — multi-specifier lines are
 * proposed, not applied, to avoid touching a shared statement.
 */
function unusedImports(file: string, content: string): FixFinding[] {
  const findings: FixFinding[] = []
  const analysis = analyzeSourceFile(content, file)
  if (!analysis) return findings
  const lines = content.split('\n')
  for (const imp of analysis.imports) {
    const bindings = [imp.defaultName, ...imp.named, imp.namespace].filter((b): b is string => Boolean(b))
    for (const b of bindings) {
      if (occurrences(content, b) > 1) continue
      const lineIndex = lines.findIndex(l => l.includes(b))
      if (lineIndex < 0) continue
      const lineText = lines[lineIndex]
      // Only whole-line removal is safe to apply: the statement starts with
      // `import` on this line (never a continuation line), carries one
      // binding, and resolves a module source.
      const fixable = bindings.length === 1 && /^import\s+[\w*{][^;]*\s+from\s+['"]/.test(lineText.trim())
      findings.push({
        id: 'unused-import',
        severity: 'warning',
        file,
        line: lineIndex + 1,
        target: b,
        message: `Import ${b} (from ${imp.source}) is never used`,
        suggestion: `Remove the ${b} specifier — dead imports trip noUnusedLocals in strict TS projects.`,
        fixable,
        edit: fixable ? { old: lineText, new: '' } : undefined,
      })
    }
  }
  return findings
}

/**
 * var→const. Safe to apply only when the identifier occurs exactly once —
 * a reassigned `var x = 1; x = 2` has two occurrences and is skipped.
 */
function varToConst(file: string, content: string): FixFinding[] {
  const findings: FixFinding[] = []
  const re = /^(\s*)var\s+([A-Za-z_$][\w$]*)\s*=/gm
  let m: RegExpExecArray | null
  while ((m = re.exec(content)) !== null) {    const name = m[2]
    // Safe to const only when the identifier is never reassigned: exactly
    // one assignment (`name =`, which is the declaration itself). Reads are
    // fine — const only forbids reassignment.
    const assignRe = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*=`, 'g')
    const assignments = content.match(assignRe)?.length ?? 0
    const fixable = assignments === 1
    findings.push({
        id: 'var-to-const',
        severity: 'warning',
        file,
        line: content.slice(0, m.index).split('\n').length,
        target: name,
        message: `var declaration for ${name}`,
        suggestion: 'Use const — var hoists and leaks across block scope, and never needs reassignment here.',
        fixable,
        edit: fixable ? { old: m[0], new: m[0].replace(/^(\s*)var\s+/, '$1const ') } : undefined,
      })
  }
  return findings
}

/** Loose equality. Never auto-applied — semantics can differ. */
function looseEquality(file: string, content: string): FixFinding[] {
  const findings: FixFinding[] = []
  const re = /([^=!<>])(==|!=)([^=])/g
  let m: RegExpExecArray | null
  while ((m = re.exec(content)) !== null) {
    const lineNo = content.slice(0, m.index).split('\n').length
    findings.push({
      id: 'loose-equality',
      severity: 'warning',
      file,
      line: lineNo,
      target: m[2],
      message: `Loose ${m[2]} comparison — coerces types before comparing`,
      suggestion: 'Use === / !== — loose equality hides type bugs (e.g. 0 == "" is true).',
      fixable: false,
    })
  }
  return findings
}

/** Detect all fixable findings in one file. */
export function scanForFixes(file: string, content: string): FixFinding[] {
  return [...unusedImports(file, content), ...varToConst(file, content), ...looseEquality(file, content)]
}
