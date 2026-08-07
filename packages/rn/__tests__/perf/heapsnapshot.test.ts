import { parseHeapSnapshot, analyzeHeapSnapshot } from '../../src/perf/heapsnapshot'
import { heapSnapshotFixture } from './fixtures'

describe('parseHeapSnapshot', () => {
  it('parses the flat node/edge layout', () => {
    const heap = parseHeapSnapshot(heapSnapshotFixture())
    expect(heap).not.toBeNull()
    expect(heap?.nodes.length).toBe(4)
    expect(heap?.nodes[0].type).toBe('synthetic')
    expect(heap?.nodes[1].name).toBe('imageCache')
    expect(heap?.totalHeapBytes).toBe(1024 + 20 * 1024 * 1024 + 1024 * 1024)
  })

  it('returns null for garbage input (never throws)', () => {
    expect(parseHeapSnapshot(null)).toBeNull()
    expect(parseHeapSnapshot([])).toBeNull()
    expect(parseHeapSnapshot({ snapshot: {} })).toBeNull()
  })
})

describe('analyzeHeapSnapshot', () => {
  it('computes first-reach retained sizes per top-level object', () => {
    const stats = analyzeHeapSnapshot(heapSnapshotFixture(), 10)!
    expect(stats).not.toBeNull()
    // imageCache anchors bigPayload: 1024 + 20MB
    const imageCache = stats.topRetained.find(o => o.name === 'imageCache')
    expect(imageCache).toBeTruthy()
    expect(imageCache?.retainedBytes).toBe(1024 + 20 * 1024 * 1024)
    const logs = stats.topRetained.find(o => o.name === 'logs')
    expect(logs?.retainedBytes).toBe(1024 * 1024)
  })

  it('ranks leak candidates by self allocation', () => {
    const stats = analyzeHeapSnapshot(heapSnapshotFixture(), 10)!
    expect(stats.topSelf[0].name).toBe('bigPayload')
    expect(stats.topSelf[0].selfBytes).toBe(20 * 1024 * 1024)
    expect(stats.nodeCount).toBe(4)
  })

  it('returns null for unusable input', () => {
    expect(analyzeHeapSnapshot(null)).toBeNull()
  })

  it('attributes a shared child to exactly one seed (no double counting)', () => {
    // Two roots both reference the same 10 MB object; the shared object must
    // be counted once, not twice — regression for the per-seed visited bug.
    const strings = ['', 'shared', 'rootA', 'rootB']
    const nodes: (number | string)[] = [
      10, 0, 1, 0, 2, 0, 0, // synthetic root (edges -> 1, 2)
      3, 1, 2, 10 * 1024 * 1024, 0, 0, 0, // object shared (10 MB)
      3, 2, 3, 512, 1, 0, 0, // object rootA (edge -> 1)
      3, 3, 4, 512, 1, 0, 0, // object rootB (edge -> 1)
    ]
    const edges = [
      1, 0, 14, // root -> node 2 (rootA)
      1, 0, 21, // root -> node 3 (rootB)
      1, 0, 7, // rootA -> node 1 (shared)
      1, 0, 7, // rootB -> node 1 (shared)
    ]
    const snapshot = {
      snapshot: {
        meta: {
          node_fields: ['type', 'name', 'id', 'self_size', 'edge_count', 'trace_node_id', 'detachedness'],
          node_types: [['hidden', 'array', 'string', 'object', 'code', 'closure', 'regexp', 'number', 'context', 'native', 'synthetic', 'concatenated string', 'sliced string', 'symbol', 'bigint', 'object shape'], 'string', 'number', 'number', 'number', 'number', 'number'],
          edge_fields: ['type', 'name_or_index', 'to_node'],
          edge_types: [['context', 'element', 'property', 'internal', 'hidden', 'shortcut', 'weak'], 'string_or_number', 'node'],
        },
        node_count: 4,
        edge_count: 4,
      },
      nodes,
      edges,
      strings,
    }
    const stats = analyzeHeapSnapshot(snapshot, 10)!
    const total = stats.topRetained.reduce((a, o) => a + o.retainedBytes, 0)
    // shared (10 MB) is counted exactly once: total = 10 MB + both 512 B
    // roots, NOT 10 MB + 10 MB + the roots (which double-counting would give).
    expect(total).toBe(10 * 1024 * 1024 + 1024)
    // Exactly one seed anchors the shared object (>10 MB retained); the other
    // keeps only its own 512 B subtree.
    const anchors = stats.topRetained.filter(o => o.retainedBytes > 10 * 1024 * 1024)
    expect(anchors.length).toBe(1)
    expect(anchors[0].retainedBytes).toBe(10 * 1024 * 1024 + 512)
  })
})
