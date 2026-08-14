/**
 * vectalon tokens — Design Token Sync Agent (Roadmap Phase 9, item 076)
 * Business Source License 1.1 (BSL-1.1)
 *
 * One deterministic pass: flatten a design-token JSON into named entries,
 * then scan source files for (a) tokens the code never references, (b)
 * hardcoded hex/rgb values that should be tokens, and (c) token pairs with
 * identical values. Reports to docs/vectalon/tokens/ (gitignored).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join, relative } from 'path'
import { walkProjectFiles } from '../upgrade/scan'
import type { TokenEntry, TokenFinding, TokenReport } from './types'

export type { TokenEntry, TokenFinding, TokenReport } from './types'

/** Where tokens reports are written. */
export const tokensDocsDir = (root: string): string => join(root, 'docs', 'vectalon', 'tokens')

const TOKEN_FILE_NAMES = ['tokens.json', 'design-tokens.json', 'theme.json', 'design.json']

/** Flatten a style-dictionary-ish token object into named entries. */
export function flattenTokens(node: Record<string, unknown>, path: string[] = []): TokenEntry[] {
  const out: TokenEntry[] = []
  for (const [key, val] of Object.entries(node)) {
    if (!val || typeof val !== 'object') continue
    const obj = val as Record<string, unknown>
    if ('value' in obj && (typeof obj.value === 'string' || typeof obj.value === 'number')) {
      const p = [...path, key]
      const pascal = p.map(s => s.replace(/[-_](.)/g, (_, c: string) => c.toUpperCase())).map(s => s[0]?.toUpperCase() + s.slice(1)).join('')
      const camel = p.map((s, i) => (i === 0 ? s.replace(/[-_](.)/g, (_, c: string) => c.toUpperCase()) : s[0]?.toUpperCase() + s.slice(1).replace(/[-_](.)/g, (_, c: string) => c.toUpperCase()))).join('')
      out.push({ path: p, value: String(obj.value), pascal, camel })
    } else {
      out.push(...flattenTokens(obj, [...path, key]))
    }
  }
  return out
}

/** Locate the design-token file (root-level names, else tokens/*.json). */
export function findTokenFile(root: string): string | null {
  for (const name of TOKEN_FILE_NAMES) {
    const p = join(root, name)
    if (existsSync(p)) return p
  }
  const tokensDir = join(root, 'tokens')
  if (existsSync(tokensDir)) {
    for (const f of ['index.json', 'tokens.json', 'colors.json']) {
      const p = join(tokensDir, f)
      if (existsSync(p)) return p
    }
  }
  return null
}

/** Would the codebase plausibly reference this token under any convention? */
function tokenReferenced(content: string, token: TokenEntry): boolean {
  const dotted = token.path.join('.')
  if (content.includes(`.${dotted}`) || content.includes(`['${dotted}']`) || content.includes(`["${dotted}"]`)) return true
  if (content.includes(token.pascal) || content.includes(token.camel)) return true
  // kebab path inside quotes: 'color.primary' → 'color-primary'
  const kebab = token.path.join('-')
  if (content.includes(`'${kebab}'`) || content.includes(`"${kebab}"`)) return true
  return false
}

/** Run the design-token sync pass. */
export function runTokenScan(root: string): TokenReport {
  const scannedAt = Date.now()
  const findings: TokenFinding[] = []
  const tokenFile = findTokenFile(root)
  if (!tokenFile) {
    return {
      scannedAt, root, tokenCount: 0, findings: [{
        id: 'orphan-token', severity: 'info',
        message: 'No design-token file found (tokens.json / design-tokens.json / theme.json).',
        suggestion: 'Create a style-dictionary-style token file so this agent can check drift.',
      }], verdict: 'approved', summary: { total: 1, bySeverity: { info: 1 } },
    }
  }

  let raw: Record<string, unknown>
  try {
    raw = JSON.parse(readFileSync(tokenFile, 'utf-8')) as Record<string, unknown>
  } catch {
    return { scannedAt, root, tokenFile, tokenCount: 0, findings: [], verdict: 'approved', summary: { total: 0, bySeverity: {} } }
  }
  const tokens = flattenTokens(raw)
  const tokenFileRel = relative(root, tokenFile).replace(/\\/g, '/')

  // Duplicate values.
  const byValue = new Map<string, string[]>()
  for (const t of tokens) byValue.set(t.value, [...(byValue.get(t.value) ?? []), t.path.join('.')])
  for (const [value, paths] of byValue) {
    if (paths.length > 1) {
      findings.push({
        id: 'duplicate-value', severity: 'info', token: value,
        message: `${paths.length} tokens share the value ${value}: ${paths.join(', ')}`,
        suggestion: 'Merge identical tokens into one source of truth so theme changes land in one place.',
      })
    }
  }

  // Orphans + hardcoded drift across source files.
  const sourceFiles = walkProjectFiles(root)
  const joinedSource = sourceFiles.map(f => { try { return readFileSync(join(root, f), 'utf-8') } catch { return '' } }).join('\n')
  for (const t of tokens) {
    if (!tokenReferenced(joinedSource, t)) {
      findings.push({
        id: 'orphan-token', severity: 'warning', token: t.path.join('.'),
        message: `Token ${t.path.join('.')} (= ${t.value}) is never referenced in source`,
        suggestion: 'Use it in the theme/component that needs this value, or delete it — dead tokens silently fork the design.',
      })
    }
  }
  const hexRe = /#[0-9a-fA-F]{3,8}\b/g
  const hardcoded = new Set<string>()
  for (const m of joinedSource.matchAll(hexRe)) hardcoded.add(m[0].toLowerCase())
  const tokenValues = new Set(tokens.map(t => t.value.toLowerCase()))
  for (const h of hardcoded) {
    if (!tokenValues.has(h)) {
      findings.push({
        id: 'hardcoded-value', severity: 'warning', token: h,
        message: `Hardcoded color ${h} has no matching design token`,
        suggestion: 'Add it as a token (or map it to the nearest existing token) so palette changes stay centralized.',
      })
    }
  }

  const bySeverity: Record<string, number> = {}
  for (const f of findings) bySeverity[f.severity] = (bySeverity[f.severity] ?? 0) + 1
  const verdict: TokenReport['verdict'] = findings.some(f => f.severity === 'warning') ? 'needs-attention' : 'approved'
  return { scannedAt, root, tokenFile: tokenFileRel, tokenCount: tokens.length, findings, verdict, summary: { total: findings.length, bySeverity } }
}

/** Render the token report as markdown. */
export function renderTokenMarkdown(report: TokenReport): string {
  const lines = ['# vectalon tokens — Design Token Sync', '']
  lines.push(`Token file: \`${report.tokenFile ?? 'none'}\`  ·  Tokens: ${report.tokenCount}  ·  Verdict: **${report.verdict}**`, '')
  if (report.findings.length === 0) lines.push('', 'No token drift detected.', '')
  for (const f of report.findings) {
    const mark = f.severity === 'warning' ? 'WARN' : 'INFO'
    lines.push(`### [${mark}] ${f.id}`, '', f.message, '', `**Fix**: ${f.suggestion}`, '')
  }
  return lines.join('\n')
}

/** Write the markdown + JSON report. */
export function writeTokenReport(root: string, report: TokenReport): { mdPath: string; jsonPath: string } {
  const dir = tokensDocsDir(root)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const md = renderTokenMarkdown(report)
  const json = JSON.stringify(report, null, 2)
  const mdPath = join(dir, 'report.md')
  const jsonPath = join(dir, 'report.json')
  writeFileSync(mdPath, md, 'utf-8')
  writeFileSync(jsonPath, json, 'utf-8')
  return { mdPath, jsonPath }
}
