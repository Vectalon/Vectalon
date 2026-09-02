import { spawnSync } from 'child_process'
import { join } from 'path'
import { MCPServer } from '../../src/protocol/MCPServer'
import { ContextEngine } from '../../src/harness/ContextEngine'
import { ModelRouter } from '../../src/model/ModelRouter'
import * as publicApi from '../../dist/index.js'

describe('public lifecycle boundaries', () => {
  afterEach(() => { process.env.VECTALON_EXPERIMENTAL = '1'; delete process.env.VECTALON_DEV_MODE })

  it('hides unqualified experimental commands and labels the beta onboarding loop', () => {
    delete process.env.VECTALON_EXPERIMENTAL
    const help = spawnSync(process.execPath, [join(__dirname, '../../bin/rn-vectalon.js'), '--help'], { encoding: 'utf8' }).stdout
    expect(help).toContain('[beta]')
    expect(help).not.toMatch(/\n\s+soc2\b/)
    expect(help).toMatch(/\n\s+init\b/)
  })

  it('exports the canonical catalog and read-only availability projection', () => {
    expect(publicApi.capabilityCatalog).toMatchObject({ productId: 'rn', productVersion: '0.18.2' })
    expect(publicApi.surfaceAvailability('cli:policy')).toEqual({ available: true, reason: 'available' })
  })

  it('blocks real command execution before any side effects, even in dev mode', async () => {
    delete process.env.VECTALON_EXPERIMENTAL
    const entry = join(__dirname, '../../dist/cli/index.js')
    const result = spawnSync(process.execPath, ['-e', `const p = require(${JSON.stringify(entry)}).createProgram(); p.commands.find(c => c.name() === 'soc2').action(() => console.log('EXECUTED')); p.parseAsync(['node','vectalon','--dev','soc2']).catch(e => { console.error(e.message); process.exitCode = 1 })`], { encoding: 'utf8' })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('experimental-opt-in-required')
    expect(result.stdout + result.stderr).not.toContain('all features unlocked')
    expect(result.stdout).not.toContain('EXECUTED')
  })

  it('describes dev mode as entitlement-only on an available command', () => {
    const entry = join(__dirname, '../../dist/cli/index.js')
    const result = spawnSync(process.execPath, ['-e', `const p = require(${JSON.stringify(entry)}).createProgram(); p.commands.find(c => c.name() === 'init').action(() => {}); p.parseAsync(['node','vectalon','--dev','init'])`], { encoding: 'utf8' })
    expect(result.stdout + result.stderr).toContain('tier/license checks bypassed; capability lifecycle unchanged')
    expect(result.stdout + result.stderr).not.toContain('all features unlocked')
  })

  it('does not advertise or dispatch experimental MCP tools without opt-in', async () => {
    delete process.env.VECTALON_EXPERIMENTAL
    const server = new MCPServer(new ContextEngine(process.cwd()), new ModelRouter())
    expect(server.getToolList().map(tool => tool.name)).not.toContain('archive_build')
    const result = await server.handleToolCall({ id: 'blocked', name: 'archive_build', arguments: {} })
    expect(result.isError).toBe(true)
    expect(result.content).toContain('experimental-opt-in-required')
    expect(server.getToolList().find(tool => tool.name === 'check_guardrails')?.description).toContain('[beta]')
  })
})
