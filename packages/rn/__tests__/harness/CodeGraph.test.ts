import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { buildCodeGraph, getDependents, getDependencies } from '../../src/harness/CodeGraph'

function createProject(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'vectalon-graph-'))
  for (const [file, content] of Object.entries(files)) {
    const full = join(dir, file)
    mkdirSync(join(full, '..'), { recursive: true })
    writeFileSync(full, content)
  }
  return dir
}

describe('CodeGraph', () => {
  afterEach(() => {
    // tmp dirs cleaned by OS
  })

  it('builds nodes, edges, and entry points from the src tree', () => {
    const dir = createProject({
      'src/index.ts': "import { helper } from './helper'\nexport function main() { helper() }\n",
      'src/helper.ts': 'export function helper() { return 1 }\n',
      'package.json': '{"name":"app"}',
    })

    const graph = buildCodeGraph(dir)

    expect(graph.nodes.some(n => n.path === 'src/index.ts' && n.type === 'file')).toBe(true)
    expect(graph.nodes.some(n => n.path === 'src/helper.ts')).toBe(true)
    expect(graph.edges.some(e => e.from === 'src/index.ts' && e.to === 'src/helper.ts' && e.type === 'import')).toBe(true)
    expect(graph.entryPoints).toContain('src/index.ts')
    expect(graph.entryPoints).not.toContain('src/helper.ts')

    rmSync(dir, { recursive: true, force: true })
  })

  it('detects circular dependencies', () => {
    const dir = createProject({
      'src/a.ts': "import { b } from './b'\nexport function a() { return b() }\n",
      'src/b.ts': "import { a } from './a'\nexport function b() { return a() }\n",
      'package.json': '{"name":"app"}',
    })

    const graph = buildCodeGraph(dir)
    const cycle = graph.cycles.find(c => c.includes('src/a.ts') && c.includes('src/b.ts'))
    expect(cycle).toBeDefined()

    rmSync(dir, { recursive: true, force: true })
  })

  it('identifies orphan files in disconnected cycles unreachable from entry points', () => {
    const dir = createProject({
      'src/main.ts': 'export function main() {}\n',
      'src/a.ts': "import { b } from './b'\nexport function a() { return b() }\n",
      'src/b.ts': "import { a } from './a'\nexport function b() { return a() }\n",
      'package.json': '{"name":"app"}',
    })

    const graph = buildCodeGraph(dir)
    // a.ts <-> b.ts form a cycle with no incoming import, so neither is an entry
    // point and both are unreachable from the real entry (main.ts) -> orphans.
    expect(graph.orphans).toContain('src/a.ts')
    expect(graph.orphans).toContain('src/b.ts')
    expect(graph.orphans).not.toContain('src/main.ts')

    rmSync(dir, { recursive: true, force: true })
  })

  it('queries dependents and dependencies for a file', () => {
    const dir = createProject({
      'src/a.ts': "import { b } from './b'\nexport function a() {}\n",
      'src/b.ts': 'export function b() {}\n',
      'package.json': '{"name":"app"}',
    })

    const graph = buildCodeGraph(dir)
    expect(getDependents(graph, 'src/b.ts')).toContain('src/a.ts')
    expect(getDependencies(graph, 'src/a.ts')).toContain('src/b.ts')

    rmSync(dir, { recursive: true, force: true })
  })
})
