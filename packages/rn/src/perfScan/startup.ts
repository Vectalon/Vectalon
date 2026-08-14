/**
 * Startup performance (Roadmap 023) — static detection of startup hot paths:
 * heavyweight libraries imported at module scope and top-level side effects
 * in entry files (index.*, App.*). Deterministic — no model calls.
 * Business Source License 1.1 (BSL-1.1)
 */
import { basename } from 'path'
import { parseSource, walk } from '../harness/AstScanner'
import type { PerfScanFinding } from './types'

/** Known heavyweight packages that block the JS thread at import time. */
const HEAVY_PACKAGES: Array<{ name: string; note: string }> = [
  { name: 'moment', note: 'large date library — prefer dayjs or the built-in Intl' },
  { name: 'lodash', note: 'full lodash import at module scope — import per-function (lodash/fp or tree-shaken) instead' },
  { name: 'rxjs', note: 'heavy reactive runtime at import scope' },
  { name: 'd3', note: 'very large visualization bundle — lazy-load or use a tree-shaken subset' },
  { name: 'three', note: 'large 3D runtime — load lazily, never at app startup' },
  { name: '@shopify/react-native-skia', note: 'native Skia binding — heavy import, prefer lazy init' },
  { name: 'victory-native', note: 'large charting lib — lazy-load charts' },
  { name: '@tensorflow/tfjs', note: 'ML runtime — must never load at startup' },
  { name: 'realm', note: 'heavy native DB binding at import scope' },
  { name: 'ffmpeg', note: 'very heavy native binding' },
]

/** Entry-ish files where module-scope work directly delays first render. */
function isEntryFile(file: string): boolean {
  const base = basename(file).toLowerCase()
  return /^index\.(ts|tsx|js|jsx)$/.test(base) || /^app\.(ts|tsx|js|jsx)$/.test(base)
}

/** Top-level side-effect shapes that run synchronously at module scope. */
function describeTopLevelSideEffect(node: { type: string; name?: string; callee?: unknown; object?: unknown }): string | null {
  switch (node.type) {
    case 'CallExpression': {
      const callee = node.callee as { type?: string; name?: string; property?: { name?: string }; object?: { name?: string } } | null
      if (!callee) return null
      if (callee.type === 'Identifier') return `top-level call to ${callee.name ?? 'fn'}()`
      if (callee.type === 'MemberExpression' && callee.property) {
        const obj = callee.object && (callee.object as { name?: string }).name
        return `top-level ${obj ? `${obj}.` : ''}${callee.property.name ?? ''}() call`
      }
      return null
    }
    case 'NewExpression':
      return 'top-level `new` allocation'
    case 'AwaitExpression':
      return 'top-level await (blocks module evaluation)'
    default:
      return null
  }
}

/**
 * Scan one source file for startup hazards. Heavy-package imports are flagged
 * anywhere (they cost regardless of entry); top-level side effects only in
 * entry files (that is where they delay first paint).
 */
export function scanStartupHazards(content: string, file: string): PerfScanFinding[] {
  const findings: PerfScanFinding[] = []
  const ast = parseSource(content, file)
  if (!ast) return findings

  const entry = isEntryFile(file)

  // Import declarations: flag known-heavy packages.
  walk(ast, (node) => {
    if (node.type !== 'ImportDeclaration') return
    const source = (node.source?.value ?? '') as string
    for (const pkg of HEAVY_PACKAGES) {
      if (source === pkg.name || source.startsWith(`${pkg.name}/`)) {
        findings.push({
          id: 'heavy-import-at-module-scope',
          category: 'startup',
          severity: pkg.name === 'moment' || pkg.name === 'lodash' ? 'warning' : 'error',
          roadmap: '023',
          file,
          line: node.loc?.start?.line ?? 1,
          target: source,
          metric: `module-scope import of ${pkg.name}`,
          message: `${source} is imported at module scope — ${pkg.note}.`,
          suggestion: `Lazy-load ${pkg.name} (dynamic import / React.lazy) or replace it; never import it at the top of a startup path.`,
        })
        break
      }
    }
  })

  // Entry files: flag top-level side effects that run before first render.
  // Babel wraps module-scope calls in ExpressionStatement under Program, so
  // key off those statements (the walk gives us the direct parent).
  if (entry) {
    walk(ast, (node, parent) => {
      const isModuleScopeStatement =
        node.type === 'ExpressionStatement' &&
        (parent === null || (parent as { type?: string }).type === 'Program')
      if (!isModuleScopeStatement) return
      const expr = (node as { expression?: unknown }).expression as
        | { type: string; name?: string; callee?: unknown; object?: unknown }
        | null
      const desc = expr ? describeTopLevelSideEffect(expr) : null
      if (desc) {
        findings.push({
          id: 'top-level-side-effect',
          category: 'startup',
          severity: 'info',
          roadmap: '023',
          file,
          line: node.loc?.start?.line ?? 1,
          target: desc,
          metric: 'module-scope work in entry file',
          message: `${desc} runs synchronously while the bundle evaluates — it delays the first render.`,
          suggestion: 'Defer it to an effect after mount, or move it into the component that actually needs it.',
        })
      }
    })
  }

  return findings
}
