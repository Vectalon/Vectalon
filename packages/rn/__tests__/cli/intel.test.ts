/**
 * CLI tests for `vectalon intel` — --graph JSON export and --json report.
 * Business Source License 1.1 (BSL-1.1)
 */
import { tmpdir } from 'os'
import { join } from 'path'
import { writeFileSync, mkdirSync } from 'fs'
import { intelCommand } from '../../src/cli/commands/intel'

function tempProject(): string {
  const dir = join(tmpdir(), `vectalon-intel-cli-${Math.random().toString(36).slice(2)}`)
  mkdirSync(join(dir, 'src'), { recursive: true })
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'cli-intel', version: '1.0.0', dependencies: { 'react-native': '0.76.0' } }))
  writeFileSync(join(dir, 'App.tsx'), "import { Home } from './src/Home'\nexport default function App() { return <Home /> }\n")
  writeFileSync(join(dir, 'src', 'Home.tsx'), `export function Home() { return null }\n`)
  return dir
}

describe('vectalon intel command', () => {
  const origExit = process.exit
  const origWrite = process.stdout.write

  afterEach(() => {
    process.exit = origExit
    process.stdout.write = origWrite
  })

  function capture(stdout: string[]): void {
    process.stdout.write = ((chunk: unknown) => {
      stdout.push(String(chunk))
      return true
    }) as typeof process.stdout.write
  }

  it('--graph deps exports the dependency graph as JSON', async () => {
    const root = tempProject()
    const out: string[] = []
    capture(out)
    await intelCommand(root, { graph: 'deps' })
    const graph = JSON.parse(out.join('')) as { nodes: string[]; internalEdges: Array<{ from: string; to: string }> }
    expect(graph.nodes).toContain('src/Home.tsx')
    expect(graph.nodes).toContain('App.tsx')
    expect(graph.internalEdges).toContainEqual({ from: 'App.tsx', to: 'src/Home.tsx' })
  })

  it('--json emits the full report', async () => {
    const root = tempProject()
    const out: string[] = []
    capture(out)
    await intelCommand(root, { json: true })
    const report = JSON.parse(out.join('')) as { schemaVersion: number; manifest: { projectName: string }; ast: { parseRate: number } }
    expect(report.schemaVersion).toBe(2)
    expect(report.manifest.projectName).toBe('cli-intel')
    expect(report.ast.parseRate).toBeGreaterThanOrEqual(0.9)
  })

  it('rejects unknown graphs with a non-zero exit', async () => {
    const root = tempProject()
    process.exit = ((code?: number) => {
      throw new Error(`exit ${code}`)
    }) as typeof process.exit
    await expect(intelCommand(root, { graph: 'nope' })).rejects.toThrow('exit 1')
  })
})
