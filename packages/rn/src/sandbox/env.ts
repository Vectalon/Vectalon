/**
 * Environment scrubbing — deny-by-default
 * Business Source License 1.1 (BSL-1.1)
 *
 * The core of "no ambient authority": the sandboxed process inherits almost
 * nothing from the parent. Only a small base allowlist survives, plus anything
 * the caller explicitly opts into via `allowEnv` / `env`. Variables whose
 * names look like credentials (tokens, keys, passwords, CI secrets) are
 * dropped even when allowlisted, so an accidental `allowEnv: ['AWS_*']` can't
 * leak secrets. The returned `dropped` array lists names only — never values —
 * so callers and clients can see exactly what was stripped.
 */

const BASE_ALLOWLIST = [
  'PATH',
  'HOME',
  'TMPDIR',
  'LANG',
  'LC_ALL',
  'LC_CTYPE',
  'USER',
  'LOGNAME',
  'SHELL',
  'TERM',
  'TZ',
  'HOSTNAME',
  'PWD',
  'OLDPWD',
  'VECTALON_DEV_MODE',
]

/** Names that look like credentials and are always dropped unless re-added via `env`. */
const SECRET_PATTERN = /(token|secret|password|passwd|credential|api[_-]?key|access[_-]?key|private[_-]?key|ssh|aws|azure|github|gitlab|bitbucket|npm|pypi|slack|webhook|bearer|cookie|auth)/i

export interface ScrubEnvOptions {
  /** Ambient variable names to keep in addition to the base allowlist. */
  allowEnv?: string[]
  /** Explicit values to pass through (win over the secret pattern). */
  env?: Record<string, string>
}

export interface ScrubEnvResult {
  env: Record<string, string>
  /** Names dropped by scrubbing — never values. */
  dropped: string[]
}

/**
 * Build the child environment. Deny-by-default: start from the base
 * allowlist, add explicitly allowed ambient vars, drop anything that looks
 * like a secret (unless explicitly re-provided via `env`), then apply the
 * caller's explicit env overrides last.
 */
export function scrubEnv(source: NodeJS.ProcessEnv, options: ScrubEnvOptions = {}): ScrubEnvResult {
  const allow = new Set<string>(BASE_ALLOWLIST)
  for (const name of options.allowEnv || []) {
    allow.add(name)
  }

  const env: Record<string, string> = {}
  const dropped: string[] = []

  // Deny-by-default: walk the *ambient* environment and keep only what is
  // allowlisted and not credential-shaped. Everything else is dropped and
  // reported (names only) so callers can see exactly what was stripped.
  for (const name of Object.keys(source)) {
    if (allow.has(name) && !SECRET_PATTERN.test(name)) {
      const value = source[name]
      if (value !== undefined) env[name] = value
    } else {
      dropped.push(name)
    }
  }

  // Explicit env overrides always win — the caller chose these values. A var
  // re-added via `env` is removed from `dropped` so the report stays truthful.
  for (const [name, value] of Object.entries(options.env || {})) {
    env[name] = value
    const index = dropped.indexOf(name)
    if (index !== -1) dropped.splice(index, 1)
  }

  return { env, dropped }
}
