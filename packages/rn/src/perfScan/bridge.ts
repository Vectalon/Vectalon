/**
 * Bridge traffic (Roadmap 027) — static detection of legacy bridge usage that
 * blocks or bypasses the New Architecture: direct `NativeModules.X` access,
 * `requireNativeComponent`, and synchronous bridge calls in render paths.
 * Deterministic — no model calls.
 * Business Source License 1.1 (BSL-1.1)
 */
import { parseSource, walk } from '../harness/AstScanner'
import type { PerfScanFinding } from './types'

/** Scan one source file for legacy bridge-traffic patterns. */
export function scanBridgeHazards(content: string, file: string): PerfScanFinding[] {
  const findings: PerfScanFinding[] = []
  const ast = parseSource(content, file)
  if (!ast) return findings

  walk(ast, (node, parent) => {
    // requireNativeComponent(...) — legacy imperative native view.
    if (node.type === 'CallExpression') {
      const callee = node.callee as { type?: string; name?: string } | null
      if (callee && callee.type === 'Identifier' && callee.name === 'requireNativeComponent') {
        findings.push({
          id: 'require-native-component',
          category: 'bridge',
          severity: 'warning',
          roadmap: '027',
          file,
          line: node.loc?.start?.line ?? 1,
          target: 'requireNativeComponent',
          metric: 'legacy native view',
          message: 'requireNativeComponent creates a native view through the legacy bridge — it is the pre-codegen path.',
          suggestion: 'Use codegenNativeComponent (New Architecture) or a typed native component wrapper.',
        })
        return
      }
    }

    // NativeModules.<Module>.<method>() — direct bridge call, especially in a
    // render path (JSX or a component body).
    if (node.type === 'MemberExpression') {
      // Only flag member access that is a call (a method invocation) — reading
      // a module reference alone is harmless. `NativeModules.Analytics.logEvent`
      // is a nested chain, so the outermost member sits directly under the
      // CallExpression.
      if (!parent || (parent as { type?: string }).type !== 'CallExpression') return

      // The outermost member's property is the invoked method (logEvent in
      // NativeModules.Analytics.logEvent). Then resolve the chain root (e.g.
      // NativeModules): either an Identifier, or the TurboModuleRegistry.get(...)
      // call that feeds the chain.
      const method = (node.property as { name?: string } | null)?.name ?? ''
      let root: { type?: string; name?: string; callee?: unknown } | null = null
      let chain: { type?: string; name?: string; property?: { name?: string }; object?: unknown } | null = node
      while (chain && chain.type === 'MemberExpression') {
        const obj = chain.object as { type?: string; name?: string; callee?: unknown } | null
        if (obj && obj.type === 'Identifier') {
          root = obj
          break
        }
        chain = obj as typeof chain
      }
      // If the chain bottoms out at a call, it is TurboModuleRegistry.get(...)
      // (root of the expression) — descend through callee member expressions
      // until we hit the identifier.
      if (!root && chain) {
        let cur: { type?: string; name?: string; object?: unknown; callee?: unknown } | null =
          chain as { type?: string; name?: string; object?: unknown; callee?: unknown }
        while (cur) {
          if (cur.type === 'Identifier') {
            root = cur
            break
          }
          const next = (cur.type === 'CallExpression' ? cur.callee : cur.object) as
            | { type?: string; name?: string; object?: unknown; callee?: unknown }
            | null
          cur = next
        }
      }

      const isNativeModules = root?.type === 'Identifier' && root.name === 'NativeModules'
      const isTurboRegistry = root?.type === 'Identifier' && root.name === 'TurboModuleRegistry'
      if (!isNativeModules && !isTurboRegistry) return

      // Calls in component files (JSX/TSX) are likelier to sit in render or
      // event paths; pure service files are informational.
      const severity: PerfScanFinding['severity'] = /\.tsx$|\.jsx$/.test(file) ? 'warning' : 'info'
      findings.push({
        id: 'direct-bridge-call',
        category: 'bridge',
        severity,
        roadmap: '027',
        file,
        line: node.loc?.start?.line ?? 1,
        target: isNativeModules ? `NativeModules.${method}` : `TurboModuleRegistry.get(...).${method}`,
        metric: 'direct native method call',
        message: `${isNativeModules ? 'NativeModules' : 'TurboModuleRegistry'} is invoked directly (${method}) — the legacy bridge path bypasses typed codegen and can block the JS thread on synchronous calls.`,
        suggestion: 'Call through a generated TurboModule (codegen), or route the call through the typed module registry with a spec.',
      })
    }
  })

  return findings
}
