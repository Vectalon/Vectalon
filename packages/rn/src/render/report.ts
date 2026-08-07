/**
 * Render result rendering
 * Business Source License 1.1 (BSL-1.1)
 */

import type { RenderNode, RenderResult } from './types'

/** Compact serialization of the render tree (props pruned for readability). */
export function stringifyRenderTree(node: RenderNode | null, depth = 0): string {
  if (!node) return '(no render output)'
  const indent = '  '.repeat(depth)
  // Text children may be raw strings or numbers — render them directly.
  if (typeof node !== 'object') return `${indent}${String(node)}`
  const props = Object.keys(node.props || {})
    .filter(k => k !== 'children')
    .map(k => `${k}=${JSON.stringify(node.props[k])}`)
    .join(' ')
  const children = Array.isArray(node.children) && node.children.length > 0
    ? '\n' + node.children.map(c => stringifyRenderTree(c as RenderNode, depth + 1)).join('\n')
    : ''
  return `${indent}<${node.type}${props ? ' ' + props : ''}>${children}`
}

/** Human-readable report of a headless render for the CLI / logs. */
export function renderRenderResult(result: RenderResult): string {
  const lines: string[] = []
  const status = result.ok ? 'rendered' : result.runtimeError ? 'runtime error' : result.loadError ? 'load error' : 'failed'
  lines.push(`status: ${status}`)
  lines.push(`transpiler: ${result.transpiler}${result.warning ? ` (${result.warning})` : ''}`)
  lines.push(`renderer: ${result.renderer}`)
  lines.push(`duration: ${result.durationMs}ms`)
  if (result.isolation) lines.push(`isolation: ${result.isolation}`)

  const failed = result.compiled.filter(c => !c.ok)
  if (failed.length > 0) {
    lines.push('')
    lines.push(`compile errors (${failed.length}):`)
    for (const f of failed) {
      lines.push(`  ✗ ${f.path}`)
      if (f.error) lines.push(`    ${f.error}`)
    }
  } else {
    lines.push(`compiled: ${result.compiled.length} file(s) ok`)
  }

  if (result.loadError) {
    lines.push('')
    lines.push(`load error: ${result.loadError}`)
  }
  if (result.runtimeError) {
    lines.push('')
    lines.push(`runtime error: ${result.runtimeError}`)
  }

  if (result.logs.length > 0) {
    lines.push('')
    lines.push('console:')
    for (const l of result.logs) {
      lines.push(`  [${l.level}] ${l.message}`)
    }
  }

  if (result.tree) {
    lines.push('')
    lines.push('render tree:')
    lines.push(stringifyRenderTree(result.tree))
  }
  return lines.join('\n')
}
