/**
 * vectalon profile — Hermes heap snapshot parser
 * Business Source License 1.1 (BSL-1.1)
 *
 * Parses Hermes heap snapshots (Chrome DevTools `.heapsnapshot` JSON, as
 * produced by Hermes' snapshot profiler) and computes:
 *
 * - **Large retained objects**: a reachability approximation of retained size
 *   per GC-root subtree (mark & sweep from synthetic roots, first-reach
 *   dominance). Objects retaining tens of MB are the classic "this screen
 *   never releases its images/listeners" leaks.
 * - **Leak candidates**: the largest self-size allocations (huge strings,
 *   arrays, objects) that are reachable and therefore not collectable.
 *
 * Deterministic, no subprocesses, no model calls. The retained-size numbers
 * are an approximation of true dominator-tree retained size — documented as
 * such so baselines stay comparable run-over-run.
 */

import type { HeapStats, RetainedObject } from './types'

/** Standard node field layout for Chrome/Hermes snapshots. */
const NODE_FIELDS = ['type', 'name', 'id', 'self_size', 'edge_count', 'trace_node_id', 'detachedness']
const EDGE_FIELDS = ['type', 'name_or_index', 'to_node']

/** Hermes/Chrome node type names (index = type value). */
const NODE_TYPES = [
  'hidden',
  'array',
  'string',
  'object',
  'code',
  'closure',
  'regexp',
  'number',
  'context',
  'native',
  'synthetic',
  'concatenated string',
  'sliced string',
  'symbol',
  'bigint',
  'object shape',
] as const

/** Edge type names (index = type value); weak edges are skipped in retention. */
const EDGE_TYPES = ['context', 'element', 'property', 'internal', 'hidden', 'shortcut', 'weak'] as const

interface HeapNode {
  /** Index into the flat nodes array (divide node index by field count). */
  index: number
  type: string
  name: string
  id: number
  selfSize: number
  edgeStart: number
  edgeCount: number
}

interface ParsedHeap {
  nodes: HeapNode[]
  /** nodeIndex -> array of target node indices (strong edges only). */
  edges: Map<number, number[]>
  nodeFieldCount: number
  totalHeapBytes: number
}

/** Resolve a node's display name; string nodes carry their content as name. */
function resolveName(nodeFieldType: number, nameField: unknown, strings: string[]): string {
  if (nodeFieldType === 2) {
    // 'string' nodes: the name field is the string content itself.
    return typeof nameField === 'string' ? String(nameField).slice(0, 120) : '(string)'
  }
  const s = strings[Number(nameField)]
  return typeof s === 'string' && s ? s : '(anonymous)'
}

/**
 * Parse a Hermes/Chrome heap snapshot JSON document. Returns null (never
 * throws) when the document is not a usable snapshot.
 */
export function parseHeapSnapshot(raw: unknown): ParsedHeap | null {
  if (!raw || typeof raw !== 'object') return null
  const doc = raw as Record<string, unknown>
  const snapshot = (doc.snapshot as Record<string, unknown> | undefined) || {}
  const meta = (snapshot.meta as Record<string, unknown> | undefined) || {}

  const nodeFields = Array.isArray(meta.node_fields) && (meta.node_fields as unknown[]).length > 0
    ? (meta.node_fields as string[])
    : NODE_FIELDS
  const edgeFields = Array.isArray(meta.edge_fields) && (meta.edge_fields as unknown[]).length > 0
    ? (meta.edge_fields as string[])
    : EDGE_FIELDS
  const nodeFieldCount = nodeFields.length
  const edgeFieldCount = edgeFields.length

  const rawNodes = Array.isArray(doc.nodes) ? (doc.nodes as unknown[]) : []
  const rawEdges = Array.isArray(doc.edges) ? (doc.edges as unknown[]) : []
  const strings = Array.isArray(doc.strings) ? (doc.strings as string[]) : []
  if (rawNodes.length === 0) return null

  const typeIdx = nodeFields.indexOf('type')
  const nameIdx = nodeFields.indexOf('name')
  const selfIdx = nodeFields.indexOf('self_size')
  const edgeCountIdx = nodeFields.indexOf('edge_count')
  const nodeTypesArr = Array.isArray(meta.node_types) ? (meta.node_types as unknown[]) : []

  const nodes: HeapNode[] = []
  let totalHeapBytes = 0
  let edgeStart = 0

  for (let i = 0; i < rawNodes.length; i += nodeFieldCount) {
    const typeField = rawNodes[i + typeIdx]
    const typeIndex = Number(typeField)
    const typeName = typeof nodeTypesArr[0] === 'object' && nodeTypesArr[0] && !Array.isArray(nodeTypesArr[0])
      ? String((nodeTypesArr[0] as Record<number, string>)[typeIndex] ?? 'hidden')
      : (NODE_TYPES[typeIndex] ?? 'hidden')
    const name = resolveName(typeIndex, rawNodes[i + nameIdx], strings)
    const selfSize = Number(rawNodes[i + selfIdx]) || 0
    const edgeCount = Number(rawNodes[i + edgeCountIdx]) || 0
    totalHeapBytes += selfSize
    nodes.push({
      index: nodes.length,
      type: typeName,
      name,
      id: Number(rawNodes[i + nodeFields.indexOf('id')]) || 0,
      selfSize,
      edgeStart,
      edgeCount,
    })
    edgeStart += edgeCount
  }

  // Build the strong-edge adjacency (weak edges never retain).
  const edgeTypeIdx = edgeFields.indexOf('type')
  const edgeToIdx = edgeFields.indexOf('to_node')
  const edges = new Map<number, number[]>()
  for (const node of nodes) {
    const targets: number[] = []
    for (let e = 0; e < node.edgeCount; e++) {
      const edgeIndex = node.edgeStart + e
      const edgeType = Number(rawEdges[edgeIndex * edgeFieldCount + edgeTypeIdx])
      if (EDGE_TYPES[edgeType] === 'weak') continue
      const toField = Number(rawEdges[edgeIndex * edgeFieldCount + edgeToIdx])
      const targetIndex = Math.floor(toField / nodeFieldCount)
      if (Number.isFinite(targetIndex) && targetIndex >= 0 && targetIndex < nodes.length) {
        targets.push(targetIndex)
      }
    }
    edges.set(node.index, targets)
  }

  return { nodes, edges, nodeFieldCount, totalHeapBytes }
}

/**
 * Retained size of each top-level object held by the GC roots.
 *
 * Walks from the synthetic (GC-root) nodes and, for every direct child,
 * sums the `self_size` of the subtree it anchors. One **shared** visited set
 * attributes every node to the first seed that reaches it (first-reach
 * dominance), so a node referenced from two roots is never counted twice.
 * This is a documented approximation of dominator-tree retained size that
 * stays O(n) and produces name-useful findings ("imageCache retains 20 MB").
 * Falls back to object/closure roots when the snapshot has no synthetic nodes.
 */
function retainedSizes(heap: ParsedHeap): Map<number, number> {
  const retained = new Map<number, number>()
  const visited = new Set<number>()
  const syntheticRoots = heap.nodes.filter(n => n.type === 'synthetic')
  const fallbackRoots = heap.nodes.filter(n => n.type === 'object' || n.type === 'closure')
  const rootNodes = syntheticRoots.length > 0 ? syntheticRoots : fallbackRoots

  for (const root of rootNodes) {
    const children = heap.edges.get(root.index) || []
    const seeds = syntheticRoots.length > 0 ? children : [root.index]
    for (const seed of seeds) {
      if (visited.has(seed)) continue
      let sum = 0
      const stack = [seed]
      while (stack.length > 0) {
        const idx = stack.pop() as number
        if (visited.has(idx)) continue
        visited.add(idx)
        sum += heap.nodes[idx].selfSize
        for (const target of heap.edges.get(idx) || []) {
          if (!visited.has(target)) stack.push(target)
        }
      }
      retained.set(seed, sum)
    }
  }
  return retained
}

/** Largest self-size allocations (leak candidates), top `limit`. */
function topSelfAllocations(heap: ParsedHeap, limit: number): { name: string; type: string; selfBytes: number }[] {
  const byName = new Map<string, { name: string; type: string; selfBytes: number }>()
  for (const node of heap.nodes) {
    if (node.type === 'synthetic' || node.type === 'hidden') continue
    const key = `${node.name}|${node.type}`
    const existing = byName.get(key)
    if (existing) existing.selfBytes += node.selfSize
    else byName.set(key, { name: node.name, type: node.type, selfBytes: node.selfSize })
  }
  return [...byName.values()].sort((a, b) => b.selfBytes - a.selfBytes).slice(0, limit)
}

/**
 * Full heap analysis: retained-size roots (top `limit`), leak candidates, and
 * totals. Retained sizes are a first-reach approximation, documented so
 * baselines remain comparable.
 */
export function analyzeHeapSnapshot(raw: unknown, topN = 10): HeapStats | null {
  const heap = parseHeapSnapshot(raw)
  if (!heap) return null
  const retained = retainedSizes(heap)

  const topRetained: RetainedObject[] = [...retained.entries()]
    .map(([nodeIndex, bytes]) => {
      const node = heap.nodes[nodeIndex]
      return {
        name: node.name,
        type: node.type,
        retainedBytes: bytes,
        selfBytes: node.selfSize,
      }
    })
    .filter(o => o.retainedBytes > 0)
    .sort((a, b) => b.retainedBytes - a.retainedBytes)
    .slice(0, topN)

  return {
    nodeCount: heap.nodes.length,
    totalHeapBytes: heap.totalHeapBytes,
    topRetained,
    topSelf: topSelfAllocations(heap, topN),
    totalRetainedBytes: topRetained.reduce((a, o) => a + o.retainedBytes, 0),
  }
}
