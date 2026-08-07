/**
 * Sandboxed code execution (V-1)
 * Business Source License 1.1 (BSL-1.1)
 *
 * The trust foundation for automation that writes and executes code: run
 * generated code, tests, and scripts in isolated processes with no ambient
 * authority — scrubbed environment, writes confined to the sandbox root
 * (OS-enforced on macOS/Linux), network denied by default, and bounded by
 * wall-clock timeouts + POSIX rlimits.
 */

export { runSandboxed } from './run'
export { scrubEnv } from './env'
export { detectBackend, resetBackendCache, buildMacProfile, buildBwrapArgs } from './backend'
export { buildLimitWrapper, buildShellArgs } from './limits'
export { renderSandboxResult } from './report'
export type { SandboxOptions, SandboxResult, IsolationLevel, SandboxBackend } from './types'
export type { ScrubEnvOptions, ScrubEnvResult } from './env'
