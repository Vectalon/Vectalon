/**
 * Re-render hazards (Roadmap 021 + 022) — static detection over JSX/TSX:
 * inline arrow handlers and object/array literals passed as props (new
 * identity every render → breaks memo), setState during render, and
 * unmemoized context provider values. Deterministic — no model calls.
 * Business Source License 1.1 (BSL-1.1)
 */
import { parseSource, walk } from '../harness/AstScanner'
import type { PerfScanFinding, PerfSeverity } from './types'

/** Count source lines (1-based) up to a node's `loc.start.line`. */
function nodeLine(node: { loc?: { start?: { line?: number } } } | null | undefined): number {
  return node?.loc?.start?.line ?? 1
}

/** Best-effort source snippet for a node (attr name, element name, …). */
function nameOf(node: unknown): string {
  const n = node as { name?: string; property?: { name?: string }; object?: unknown } | null
  if (!n) return ''
  if (typeof n.name === 'string') return n.name
  if (n.property && typeof n.property.name === 'string') return n.property.name
  return ''
}

export interface RenderScanResult {
  findings: PerfScanFinding[]
}

/**
 * Scan one source file for re-render hazards. `content` is the file text,
 * `file` the path relative to the project root. Returns only findings, so a
 * file with no hazards contributes nothing.
 */
export function scanRenderHazards(content: string, file: string): PerfScanFinding[] {
  const findings: PerfScanFinding[] = []
  if (!/\.[tj]sx?$/.test(file) || !/<\w/.test(content)) return findings

  const ast = parseSource(content, file)
  if (!ast) return findings

  // Track inline handlers / literals per JSX element so we can merge the
  // count into one finding per element (avoid a finding per prop).
  const elementStats = new Map<
    number,
    { element: string; inlineHandlers: number; inlineLiterals: number }
  >()

  walk(ast, (node, parent) => {
    if (node.type === 'JSXOpeningElement') {
      const element = nameOf(node.name)
      const line = nodeLine(node)
      const stats = elementStats.get(line) ?? { element, inlineHandlers: 0, inlineLiterals: 0 }
      const attrs = (node.attributes ?? []) as Array<{
        type: string
        name?: { type?: string; name?: string }
        value?: { type?: string; expression?: { type?: string } } | null
      }>
      for (const attr of attrs) {
        if (attr.type !== 'JSXAttribute' || !attr.name) continue
        const val = attr.value
        if (!val) continue
        // JSX attribute values are wrapped in JSXExpressionContainer; unwrap
        // to the expression (an arrow fn, object literal, etc.).
        const expr = val.type === 'JSXExpressionContainer' ? val.expression : val
        if (!expr) continue
        if (expr.type === 'ArrowFunctionExpression' || expr.type === 'FunctionExpression') {
          stats.inlineHandlers++
        } else if (expr.type === 'ObjectExpression' || expr.type === 'ArrayExpression') {
          stats.inlineLiterals++
        }
      }
      elementStats.set(line, stats)

      // <X.Provider value={{…}}> — unmemoized context value re-renders every consumer.
      const name = node.name as { object?: { name?: string }; property?: { name?: string } }
      if (name && name.object && name.property && name.property.name === 'Provider') {
        const valueAttr = attrs.find(a => a.name && a.name.name === 'value')
        const valueExpr =
          valueAttr && valueAttr.value
            ? valueAttr.value.type === 'JSXExpressionContainer'
              ? valueAttr.value.expression
              : valueAttr.value
            : null
        if (valueExpr && valueExpr.type === 'ObjectExpression') {
          const providerName = nameOf(name.object)
          findings.push({
            id: 'unmemoized-context-value',
            category: 'render',
            severity: 'warning',
            roadmap: '022',
            file,
            line,
            target: `${providerName}.Provider`,
            metric: 'inline context value',
            message: `${providerName}.Provider gets an inline object literal as value — every render re-renders every consumer of the context.`,
            suggestion: 'Memoize the value object with useMemo and list the real dependencies.',
          })
        }
      }
      return
    }

    // setState(...) called directly in a component body (not inside a
    // function/effect/callback) re-renders synchronously during render.
    if (node.type === 'CallExpression') {
      const callee = node.callee as { type?: string; name?: string }
      if (callee && callee.type === 'Identifier' && /^set[A-Z]/.test(callee.name ?? '')) {
        // Only flag when the call sits at statement level of a function body.
        if (parent && parent.type === 'ExpressionStatement') {
          const fn = callee.name as string
          const line = nodeLine(node)
          findings.push({
            id: 'set-state-during-render',
            category: 'render',
            severity: 'error',
            roadmap: '021',
            file,
            line,
            target: fn,
            metric: 'render-phase setState',
            message: `${fn} is called directly in the render body — React re-renders the component synchronously, and the second render can cause cascading re-renders.`,
            suggestion: 'Move the state update into an event handler, useEffect, or a derived-value pattern (compute during render, set in an effect).',
          })
        }
      }
    }
  })

  for (const [line, stats] of elementStats) {
    if (stats.inlineHandlers >= 2) {
      findings.push({
        id: 'inline-arrow-handlers',
        category: 'render',
        severity: 'warning',
        roadmap: '022',
        file,
        line,
        target: stats.element,
        metric: `${stats.inlineHandlers} inline handler(s)`,
        message: `${stats.element} receives ${stats.inlineHandlers} inline arrow function prop(s) — a new function identity on every render breaks React.memo and re-renders the subtree.`,
        suggestion: 'Hoist handlers with useCallback, or define them outside the component when they close over no changing state.',
      })
    }
    if (stats.inlineLiterals >= 2) {
      findings.push({
        id: 'inline-object-literals',
        category: 'render',
        severity: 'warning',
        roadmap: '022',
        file,
        line,
        target: stats.element,
        metric: `${stats.inlineLiterals} inline literal prop(s)`,
        message: `${stats.element} receives ${stats.inlineLiterals} inline object/array literal prop(s) — a new reference every render defeats memoization.`,
        suggestion: 'Extract constants to module scope, or memoize with useMemo when they depend on state.',
      })
    }
  }

  return findings
}

