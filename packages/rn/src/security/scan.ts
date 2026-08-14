/**
 * vectalon sec — secrets scanner (Roadmap Phase 8, item 063)
 * Business Source License 1.1 (BSL-1.1)
 *
 * Walks the project tree for source + config files (including .env* dotfiles,
 * which the generic walkers skip) and flags hardcoded secrets line by line:
 * provider tokens first (AWS, GitHub, Slack, Stripe, Google, private keys —
 * errors), then generic key/secret/password assignments (warnings). Every
 * captured value is redacted in the finding — the report must never echo a
 * secret back.
 */

import { readdirSync, statSync } from 'fs'
import { join, relative } from 'path'
import { reportError } from '../utils/safe'
import type { SecurityFinding } from './types'

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'build', 'dist', '.expo', 'Pods', 'DerivedData',
  'xcuserdata', '.gradle', '.cxx', 'coverage', '.vectalon', '.turbo',
  'android/app/build', 'ios/build', '.next', '.idea', '.vscode',
])

const SECRET_EXTS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json',
  '.plist', '.gradle', '.properties', '.yaml', '.yml', '.toml', '.ini',
])

/** Walk source + config files, including `.env*` dotfiles (others skipped). */
export function walkSecretFiles(root: string): string[] {
  const out: string[] = []
  const stack = [root]
  while (stack.length > 0) {
    const dir = stack.pop() as string
    let entries: string[]
    try {
      entries = readdirSync(dir)
    } catch (err) {
      reportError(err, `sec: reading directory ${dir}`)
      continue
    }
    for (const entry of entries) {
      if (SKIP_DIRS.has(entry)) continue
      const full = join(dir, entry)
      let stat
      try {
        stat = statSync(full)
      } catch (err) {
        reportError(err, `sec: statting ${full}`)
        continue
      }
      if (stat.isDirectory()) {
        stack.push(full)
        continue
      }
      // .env, .env.production, … — always scan. Other dotfiles (.gitignore…)
      // are skipped. Everything else must match an extension.
      if (entry.startsWith('.env')) {
        out.push(relative(root, full))
        continue
      }
      if (entry.startsWith('.')) continue
      const ext = entry.slice(entry.lastIndexOf('.'))
      if (SECRET_EXTS.has(ext)) out.push(relative(root, full))
    }
  }
  return out.sort()
}

/** Redact a captured secret — first 4 chars + last 2, nothing more. */
export function redact(value: string): string {
  const v = value.trim()
  if (v.length <= 8) return '***'
  return `${v.slice(0, 4)}…${v.slice(-2)}`
}

interface SecretRule {
  id: string
  severity: SecurityFinding['severity']
  /** Matches the whole line; capture group 1 is the secret value when present. */
  re: RegExp
}

/** Provider tokens are unambiguous — errors. */
const PROVIDER_RULES: SecretRule[] = [
  { id: 'aws-access-key', severity: 'error', re: /\b(AKIA[0-9A-Z]{16})\b/ },
  { id: 'github-token', severity: 'error', re: /\b(gh[pousr]_[A-Za-z0-9]{20,})\b/ },
  { id: 'slack-token', severity: 'error', re: /\b(xox[baprs]-[A-Za-z0-9-]{10,})\b/ },
  { id: 'stripe-secret', severity: 'error', re: /\b((?:sk|rk)_(?:live|test)_[0-9a-zA-Z]{16,})\b/ },
  { id: 'google-api-key', severity: 'error', re: /\b(AIza[0-9A-Za-z_-]{35})\b/ },
  { id: 'private-key', severity: 'error', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
]

/** Generic assignments — warnings, filtered against placeholder values. */
const GENERIC_RULES: SecretRule[] = [
  { id: 'hardcoded-api-key', severity: 'warning', re: /\b(?:api[_-]?key|apikey|api_token|access[_-]?token)\s*[:=]\s*['"]([^'"\s]{8,})['"]/i },
  { id: 'hardcoded-secret', severity: 'warning', re: /\b(?:secret|client[_-]?secret|auth[_-]?token|bearer[_-]?token)\s*[:=]\s*['"]([^'"\s]{12,})['"]/i },
  { id: 'hardcoded-password', severity: 'warning', re: /\bpassword\s*[:=]\s*['"]([^'"\s]{8,})['"]/i },
]

/** Values that are obviously not secrets — never flag these. */
function isPlaceholder(value: string): boolean {
  const v = value.trim().toLowerCase()
  if (v.length < 8) return true
  if (/^<[^>]+>$/.test(v)) return true
  if (/^(true|false|null|undefined)$/.test(v)) return true
  // Stems only count when followed by a separator, digit, or end — so
  // `changeme1` is a placeholder but `changeling-secret` is not skipped by
  // the `change` prefix, and ordinary secrets are never caught by substrings.
  return /^(your|changeme|change[-_]me|example|test|dummy|sample|placeholder|redacted|xxxx+|secret|password|token|api[-_]?key|todo|fixme|insert|foo|bar)(?:[-_.\d ]|$)/.test(v)
}

/** Scan one file's content for secrets, redacting every captured value. */
export function scanSecrets(file: string, content: string): SecurityFinding[] {
  const findings: SecurityFinding[] = []
  const lines = content.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    for (const rule of PROVIDER_RULES) {
      const m = line.match(rule.re)
      if (!m) continue
      findings.push({
        id: rule.id,
        category: 'secrets',
        severity: rule.severity,
        file,
        line: i + 1,
        target: m[1] ? redact(m[1]) : 'private key block',
        message: `Possible ${rule.id.replace(/-/g, ' ')} committed at ${file}:${i + 1}`,
        suggestion: 'Remove it from the tree and history, rotate the key, and load it from an environment variable or a secrets manager (never commit it again).',
      })
      break // one provider finding per line
    }
    for (const rule of GENERIC_RULES) {
      const m = line.match(rule.re)
      if (!m || !m[1] || isPlaceholder(m[1])) continue
      findings.push({
        id: rule.id,
        category: 'secrets',
        severity: rule.severity,
        file,
        line: i + 1,
        target: redact(m[1]),
        message: `Possible ${rule.id.replace(/-/g, ' ')} committed at ${file}:${i + 1}`,
        suggestion: 'Move the value to an environment variable or a secrets manager and read it at runtime — never hardcode credentials in source.',
      })
    }
  }
  return findings
}
