/**
 * Completeness guard: the /reports page must show a real document for every
 * agent in the catalog — MISS NOTHING. If an agent is added to lib/agents.ts
 * and no sample is synced from the demo project (scripts/sync-reports.mjs),
 * this test fails in CI.
 *
 * Parses two sources of truth directly (no cross-package imports, so it runs
 * in the website's plain node jest environment):
 *   - lib/agents.ts           → the shipped agent commands
 *   - lib/reportSamples.ts    → the real documents on the /reports page
 */
import * as fs from 'fs'
import * as path from 'path'

const LIB_DIR = path.resolve(__dirname, '../lib')
const AGENTS = path.join(LIB_DIR, 'agents.ts')
const REPORT_SAMPLES = path.join(LIB_DIR, 'reportSamples.ts')

/** Extract `cmd: '...'` + `name: '...'` pairs from the agent catalog. */
function catalogAgents(source: string): { cmd: string; name: string }[] {
  const agents: { cmd: string; name: string }[] = []
  const re = /cmd:\s*'([a-z0-9-]+)'/g
  let m: RegExpExecArray | null
  while ((m = re.exec(source)) !== null) {
    const after = source.slice(m.index + m[0].length, source.indexOf('},', m.index))
    const nameMatch = after.match(/name:\s*'([^']+)'/)
    if (!nameMatch) throw new Error(`no name found for cmd ${m[1]}`)
    agents.push({ cmd: m[1], name: nameMatch[1] })
  }
  return agents
}

/** Extract `cmd: "..."` values from the generated samples module. */
function sampleCommands(source: string): string[] {
  const cmds: string[] = []
  const re = /cmd:\s*"([a-z0-9-]+)"/g
  let m: RegExpExecArray | null
  while ((m = re.exec(source)) !== null) cmds.push(m[1])
  return cmds
}

describe('catalog agents vs the /reports documents', () => {
  const agents = catalogAgents(fs.readFileSync(AGENTS, 'utf8'))
  const samples = sampleCommands(fs.readFileSync(REPORT_SAMPLES, 'utf8'))

  it('parses exactly 40 catalog agents (sanity check on the parser)', () => {
    expect(agents).toHaveLength(40)
  })

  it('shows a document for every catalog agent — nothing missing', () => {
    const missing = agents.map(a => a.cmd).filter(c => !samples.includes(c))
    expect(missing).toEqual([])
  })

  it('has no sample documents for agents that no longer exist', () => {
    const cmds = agents.map(a => a.cmd)
    const orphans = samples.filter(c => !cmds.includes(c))
    expect(orphans).toEqual([])
  })

  it('has no duplicate sample documents', () => {
    expect(new Set(samples).size).toBe(samples.length)
  })
})
