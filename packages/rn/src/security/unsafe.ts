/**
 * vectalon sec — unsafe-pattern scanner (Roadmap Phase 8, item 063)
 * Business Source License 1.1 (BSL-1.1)
 *
 * Flags code-level security smells in source files: dynamic code execution,
 * shell command interpolation, disabled TLS verification, cleartext HTTP,
 * Math.random used for security material, SQL string concatenation, XSS
 * sinks, and weak hashes. Deterministic and line-pinned; each pattern fires
 * once per file at its first occurrence.
 */

import type { SecurityFinding } from './types'

interface UnsafeRule {
  id: string
  severity: SecurityFinding['severity']
  /** Match anywhere in the file; `line` is computed from the match index. */
  re: RegExp
  message: (file: string, line: number) => string
  suggestion: string
}

/** Security keywords that make a Math.random call worth flagging. */
const SECURITY_TERMS = /(?:token|password|secret|api[_-]?key|nonce|salt|otp|one[-_]?time|verification|pin|code)/i

const RULES: UnsafeRule[] = [
  {
    id: 'dynamic-code-execution',
    severity: 'warning',
    re: /\b(?:eval|new Function)\s*\(/,
    message: (file, line) => `Dynamic code execution (eval / new Function) at ${file}:${line}`,
    suggestion: 'Replace it with a safe construct (data-driven logic or a lookup table) — eval runs attacker-influenced strings as code.',
  },
  {
    id: 'shell-command-injection',
    severity: 'warning',
    re: /\b(?:exec|execSync|execFile|spawn|spawnSync)\s*\([^)]*['"`]\s*\+/,
    message: (file, line) => `Shell command built with string interpolation at ${file}:${line}`,
    suggestion: 'Pass arguments as an argv array (no shell) or validate/escape user input — interpolated commands are injection targets.',
  },
  {
    id: 'tls-verification-disabled',
    severity: 'warning',
    re: /rejectUnauthorized\s*:\s*false|NODE_TLS_REJECT_UNAUTHORIZED\s*=\s*0|allowInsecureHttps|NSAllowsArbitraryLoads|usesCleartextTraffic/,
    message: (file, line) => `TLS certificate verification disabled at ${file}:${line}`,
    suggestion: 'Keep certificate validation on and pin certificates where possible — disabling it exposes traffic to man-in-the-middle attacks.',
  },
  {
    id: 'insecure-random',
    severity: 'warning',
    re: /\bMath\.random\(\)/,
    message: (file, line) => `Math.random used near security-sensitive material at ${file}:${line}`,
    suggestion: 'Use a cryptographically secure generator (crypto.getRandomValues / react-native-get-random-values) for tokens, keys, and codes.',
  },
  {
    id: 'sql-injection',
    severity: 'warning',
    re: /\b(?:SELECT|INSERT|UPDATE|DELETE)\b[^;]{0,160}['"`]\s*\+/i,
    message: (file, line) => `SQL query built with string concatenation at ${file}:${line}`,
    suggestion: 'Use parameterized queries / prepared statements — concatenation lets input rewrite the query.',
  },
  {
    id: 'cleartext-http',
    severity: 'info',
    re: /\bhttp:\/\/\S+/,
    message: (file, line) => `Cleartext http:// URL at ${file}:${line}`,
    suggestion: 'Use https:// — cleartext traffic can be read and modified in transit.',
  },
  {
    id: 'xss-sink',
    severity: 'info',
    re: /dangerouslySetInnerHTML|\.innerHTML\s*=|document\.write\s*\(/,
    message: (file, line) => `XSS sink (HTML injection) at ${file}:${line}`,
    suggestion: 'Render text as text (React escapes it) or sanitize before injecting HTML — unsanitized HTML is an XSS vector.',
  },
  {
    id: 'webview-hardening',
    severity: 'info',
    re: /\bjavaScriptEnabled\s*=|allowFileAccess|allowUniversalAccessFromFileURLs/,
    message: (file, line) => `WebView hardening flags at ${file}:${line}`,
    suggestion: 'Disable JavaScript/file access in WebViews that render remote or untrusted content, or scope the allowed origins.',
  },
  {
    id: 'weak-hash',
    severity: 'info',
    re: /\b(?:md5|sha1)\s*\(/i,
    message: (file, line) => `Weak hash (MD5 / SHA-1) used at ${file}:${line}`,
    suggestion: 'Use SHA-256+ for non-crypto integrity or a password hasher (bcrypt/scrypt/argon2) for credentials — MD5/SHA-1 are broken.',
  },
]

/** Line-pin a regex match inside a file's content. */
function lineAt(content: string, index: number): number {
  let line = 1
  for (let i = 0; i < index && i < content.length; i++) {
    if (content.charCodeAt(i) === 10) line++
  }
  return line
}

/** Scan one source file for unsafe patterns (first match per rule). */
export function scanUnsafe(file: string, content: string): SecurityFinding[] {
  const findings: SecurityFinding[] = []
  for (const rule of RULES) {
    const m = rule.re.exec(content)
    if (!m) continue
    const line = lineAt(content, m.index)
    // The insecure-random rule needs the security context on the same line
    // to stay precise — otherwise React keys alone would light it up.
    if (rule.id === 'insecure-random') {
      const lineText = content.slice(content.lastIndexOf('\n', m.index) + 1, content.indexOf('\n', m.index) === -1 ? content.length : content.indexOf('\n', m.index))
      if (!SECURITY_TERMS.test(lineText)) continue
    }
    findings.push({
      id: rule.id,
      category: 'unsafe',
      severity: rule.severity,
      file,
      line,
      target: m[0].length > 48 ? `${m[0].slice(0, 48)}…` : m[0],
      message: rule.message(file, line),
      suggestion: rule.suggestion,
    })
  }
  return findings
}
