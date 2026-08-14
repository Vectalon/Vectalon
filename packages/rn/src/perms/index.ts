/**
 * vectalon perms — Agent Permissions Audit (Roadmap Phase 9, item 078)
 * Business Source License 1.1 (BSL-1.1)
 *
 * Finds agent configuration files and audits what the agent is allowed to
 * do: tools granted in `allow` lists, local-exec MCP servers, and any
 * credential-shaped strings in config. Reports to docs/vectalon/perms/
 * (gitignored).
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs'
import { join, relative } from 'path'
import type { PermFinding, PermReport } from './types'

export type { PermFinding, PermReport } from './types'

/** Where perms reports are written. */
export const permsDocsDir = (root: string): string => join(root, 'docs', 'vectalon', 'perms')

const CONFIG_CANDIDATES = [
  '.claude/settings.json',
  '.claude/settings.local.json',
  '.mcp.json',
  '.cursor/mcp.json',
  '.agents/settings.json',
  '.codex/config.toml',
  'mcp.json',
]

/** Dangerous tools that can mutate the environment when auto-approved. */
const DANGEROUS_TOOL_RE = /\b(bash|shell|terminal|write_file|edit|patch|execute|run_command|sudo)\b/i
const SECRET_RE = /(sk_[a-z]+_[0-9a-zA-Z]{8,}|AKIA[0-9A-Z]{16}|ghp_[0-9A-Za-z]{20,}|xox[baprs]-[0-9A-Za-z-]{10,}|api[_-]?key\s*[:=]\s*["'][^"']{8,}|password\s*[:=]\s*["'][^"']{6,})/

function collectConfigFiles(root: string): string[] {
  const out: string[] = []
  for (const rel of CONFIG_CANDIDATES) {
    const p = join(root, rel)
    if (existsSync(p)) out.push(p)
  }
  // Any .mcp.json anywhere under .cursor / .agents / .claude.
  for (const dir of ['.cursor', '.agents', '.claude']) {
    const base = join(root, dir)
    if (!existsSync(base)) continue
    const walk = (d: string): void => {
      for (const entry of readdirSync(d, { withFileTypes: true })) {
        const p = join(d, entry.name)
        if (entry.isDirectory()) walk(p)
        else if (entry.name === 'mcp.json' || entry.name.endsWith('settings.json')) out.push(p)
      }
    }
    walk(base)
  }
  return [...new Set(out)]
}

/** Audit one agent/MCP config file. */
export function auditConfigFile(root: string, file: string): PermFinding[] {
  const findings: PermFinding[] = []
  let content: string
  try {
    content = readFileSync(file, 'utf-8')
  } catch {
    return findings
  }
  const rel = relative(root, file).replace(/\\/g, '/')
  const lines = content.split('\n')
  const push = (id: string, severity: PermFinding['severity'], line: number, message: string, suggestion: string) =>
    findings.push({ id, severity, file: rel, line, message, suggestion })

  const isMcp = rel.endsWith('mcp.json')
  let parsed: unknown = null
  try {
    parsed = JSON.parse(content)
  } catch { /* non-JSON configs get line-based checks below */ }

  if (parsed && typeof parsed === 'object') {
    const obj = parsed as Record<string, unknown>
    const permissions = (obj.permissions ?? obj.permission) as Record<string, unknown> | undefined
    const allow = Array.isArray(permissions?.allow) ? (permissions.allow as unknown[]) : []
    for (const a of allow) {
      const s = String(a)
      if (DANGEROUS_TOOL_RE.test(s)) {
        const line = lines.findIndex(l => l.includes(s)) + 1
        push('dangerous-tool-allow', 'warning', line || 1, `Agent may auto-run "${s}" without approval`, 'Require explicit approval for shell/file-mutation tools — auto-approving them lets a prompt injection run arbitrary code.')
      }
    }
    if (isMcp) {
      const servers = obj.mcpServers ?? obj.servers
      if (servers && typeof servers === 'object') {
        for (const [name, cfg] of Object.entries(servers as Record<string, unknown>)) {
          const c = cfg as Record<string, unknown>
          if (typeof c.command === 'string') {
            const line = lines.findIndex(l => l.includes(name)) + 1
            push('local-mcp-exec', 'info', line || 1, `MCP server "${name}" launches a local process (${c.command})`, 'Local MCP servers run with the user\'s privileges — review the server code before trusting it with repo contents.')
          }
        }
      }
    }
  }

  // Credentials in config.
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(SECRET_RE)
    if (m) {
      push('credential-in-config', 'error', i + 1, 'Credential-shaped value found in agent config', 'Remove it and load from environment variables or a secrets manager — config files get committed and shared.')
    }
  }
  return findings
}

/** Run one agent-permissions audit. */
export function runPermsScan(root: string): PermReport {
  const scannedAt = Date.now()
  const configFiles = collectConfigFiles(root)
  const findings: PermFinding[] = []
  for (const file of configFiles) findings.push(...auditConfigFile(root, file))
  const bySeverity: Record<string, number> = {}
  for (const f of findings) bySeverity[f.severity] = (bySeverity[f.severity] ?? 0) + 1
  return {
    scannedAt, root,
    configFiles: configFiles.map(f => relative(root, f).replace(/\\/g, '/')),
    findings,
    verdict: findings.some(f => f.severity === 'error') ? 'changes-requested' : findings.some(f => f.severity === 'warning') ? 'needs-attention' : 'approved',
    summary: { total: findings.length, bySeverity },
  }
}

/** Render the audit as markdown. */
export function renderPermsMarkdown(report: PermReport): string {
  const lines = ['# vectalon perms — Agent Permissions Audit', '']
  lines.push(`Config files: ${report.configFiles.length}  ·  Verdict: **${report.verdict}**`, '')
  if (report.configFiles.length === 0) lines.push('', 'No agent/MCP config files found — nothing to audit.', '')
  for (const f of report.findings) {
    const mark = f.severity === 'error' ? 'ERROR' : f.severity === 'warning' ? 'WARN' : 'INFO'
    lines.push(`### [${mark}] ${f.id} — \`${f.file}:${f.line}\``, '', f.message, '', `**Fix**: ${f.suggestion}`, '')
  }
  return lines.join('\n')
}

/** Write the markdown + JSON report. */
export function writePermsReport(root: string, report: PermReport): { mdPath: string; jsonPath: string } {
  const dir = permsDocsDir(root)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const md = renderPermsMarkdown(report)
  const json = JSON.stringify(report, null, 2)
  const mdPath = join(dir, 'report.md')
  const jsonPath = join(dir, 'report.json')
  writeFileSync(mdPath, md, 'utf-8')
  writeFileSync(jsonPath, json, 'utf-8')
  return { mdPath, jsonPath }
}
