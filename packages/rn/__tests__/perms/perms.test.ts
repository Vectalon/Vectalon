/**
 * vectalon perms — Agent Permissions Audit (Roadmap 078) — hermetic tests.
 * Business Source License 1.1 (BSL-1.1)
 */
import { readFileSync } from 'fs'
import { runPermsScan, writePermsReport } from '../../src/perms'
import { createTempProject, cleanup } from '../helpers/tmp'

describe('perms: runPermsScan', () => {
  let dir: string
  afterEach(() => cleanup(dir))

  it('flags auto-approved shell tools', () => {
    dir = createTempProject({
      'package.json': '{}',
      '.claude/settings.json': JSON.stringify({
        permissions: { allow: ['Bash(npm run build)', 'Read(.env)', 'Write(src/**)'] },
      }),
    })
    const report = runPermsScan(dir)
    expect(report.findings.some(f => f.id === 'dangerous-tool-allow' && f.message.includes('Bash'))).toBe(true)
  })

  it('flags credentials embedded in config as errors', () => {
    // Runtime-joined so no real key-shaped literal lives in the test source.
    const fakeKey = ['sk', 'test', 'abcdefghijklmnopqrstuvwx'].join('_')
    dir = createTempProject({
      'package.json': '{}',
      '.claude/settings.json': JSON.stringify({ apiKey: fakeKey }),
    })
    const report = runPermsScan(dir)
    expect(report.findings.some(f => f.id === 'credential-in-config' && f.severity === 'error')).toBe(true)
    expect(report.verdict).toBe('changes-requested')
  })

  it('collects and audits agent config files', () => {
    dir = createTempProject({
      'package.json': '{}',
      '.mcp.json': JSON.stringify({ mcpServers: { local: { command: 'node', args: ['server.js'] } } }),
      '.claude/settings.json': JSON.stringify({ permissions: { allow: ['Bash(*)'] } }),
    })
    const report = runPermsScan(dir)
    expect(report.configFiles.length).toBeGreaterThanOrEqual(2)
    expect(report.findings.some(f => f.id === 'dangerous-tool-allow')).toBe(true)
    expect(report.findings.some(f => f.id === 'local-mcp-exec')).toBe(true)
    expect(report.verdict).toBe('needs-attention')
  })

  it('approved when no config files exist', () => {
    dir = createTempProject({ 'package.json': '{}' })
    const report = runPermsScan(dir)
    expect(report.configFiles).toHaveLength(0)
    expect(report.verdict).toBe('approved')
  })

  it('writes report.md and report.json', () => {
    dir = createTempProject({ 'package.json': '{}', '.mcp.json': '{}' })
    const report = runPermsScan(dir)
    const { mdPath, jsonPath } = writePermsReport(dir, report)
    expect(readFileSync(mdPath, 'utf-8')).toContain('perms')
    expect(readFileSync(jsonPath, 'utf-8')).toContain('"verdict"')
  })
})
