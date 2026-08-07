/** Shared Hermes .cpuprofile / .heapsnapshot fixtures for the perf tests. */

/** CPU profile with a single blocking run of `blockMs` in `useEffect`. */
export function cpuProfileFixture(blockMs: number): Record<string, unknown> {
  const runSamples = Math.max(2, Math.round(blockMs / 50))
  const samples = [1, 2, ...new Array<number>(runSamples).fill(3), 1]
  const timeDeltas = [1000, 1000, ...new Array<number>(runSamples).fill(50000), 1000]
  return {
    startTime: 0,
    endTime: samples.length * 50000 + 2000000,
    nodes: [
      { id: 1, callFrame: { functionName: '(root)', url: '', lineNumber: 0 }, hitCount: 0, children: [2] },
      { id: 2, callFrame: { functionName: 'renderApp', url: 'file:///App.tsx', lineNumber: 10 }, hitCount: 0, children: [3] },
      { id: 3, callFrame: { functionName: 'useEffect', url: 'file:///App.tsx', lineNumber: 42 }, hitCount: 0, children: [] },
    ],
    samples,
    timeDeltas,
  }
}

/**
 * Heap snapshot with two retained subtrees:
 * - `imageCache` (object) → retains a 20 MB string `bigPayload`
 * - `logs` (array) → 1 MB self
 */
export function heapSnapshotFixture(): Record<string, unknown> {
  const strings = ['', 'imageCache', 'bigPayload', 'logs']
  // Node layout: [type, name, id, self_size, edge_count, trace_node_id, detachedness]
  // String nodes carry their content inline as the name field (Chrome format).
  const nodes: (number | string)[] = [
    10, 0, 1, 0, 2, 0, 0, // synthetic root (edges -> 1, 3)
    3, 1, 2, 1024, 1, 0, 0, // object imageCache (edge -> 2)
    2, 'bigPayload', 3, 20 * 1024 * 1024, 0, 0, 0, // string bigPayload (20 MB)
    1, 3, 4, 1024 * 1024, 0, 0, 0, // array logs (1 MB)
  ]
  // Edge layout: [type, name_or_index, to_node]; to_node = nodeIndex * 7
  const edges = [
    1, 0, 7, // root -> node 1 (imageCache)
    1, 0, 21, // root -> node 3 (logs)
    1, 0, 14, // imageCache -> node 2 (bigPayload)
  ]
  return {
    snapshot: {
      meta: {
        node_fields: ['type', 'name', 'id', 'self_size', 'edge_count', 'trace_node_id', 'detachedness'],
        node_types: [
          ['hidden', 'array', 'string', 'object', 'code', 'closure', 'regexp', 'number', 'context', 'native', 'synthetic', 'concatenated string', 'sliced string', 'symbol', 'bigint', 'object shape'],
          'string', 'number', 'number', 'number', 'number', 'number',
        ],
        edge_fields: ['type', 'name_or_index', 'to_node'],
        edge_types: [['context', 'element', 'property', 'internal', 'hidden', 'shortcut', 'weak'], 'string_or_number', 'node'],
      },
      node_count: 4,
      edge_count: 3,
    },
    nodes,
    edges,
    strings,
  }
}
