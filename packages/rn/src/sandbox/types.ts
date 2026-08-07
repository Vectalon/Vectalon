/**
 * Sandboxed code execution — types
 * Business Source License 1.1 (BSL-1.1)
 *
 * V-1: the trust foundation for running generated code, tests, and scripts.
 * A command runs inside an isolated process with no ambient authority: the
 * environment is scrubbed to a deny-by-default allowlist, file writes are
 * confined to the sandbox root (OS-enforced where available), network is
 * denied by default, and CPU / memory / file-size limits are applied via
 * POSIX rlimits. Every run reports exactly which isolation backend was used
 * and what was dropped, so callers can make trust decisions.
 */

/** How strongly the OS enforced the sandbox. */
export type IsolationLevel = 'sandbox-exec' | 'bwrap' | 'process'

export interface SandboxOptions {
  /**
   * Sandbox root. The command runs with this as its working directory and
   * (when the OS backend enforces it) is the only directory it can write to.
   * Must exist.
   */
  root: string
  /** Hard wall-clock timeout in ms. Default 30_000. */
  timeoutMs?: number
  /** CPU time limit in seconds (ulimit -t). Default: none. */
  cpuSeconds?: number
  /** Virtual memory limit in MB (ulimit -v). Default: none. */
  memoryMb?: number
  /** Max output file size in MB (ulimit -f). Default: none. */
  fileSizeMb?: number
  /** Max open files (ulimit -n). Default 128. */
  maxOpenFiles?: number
  /** Max processes for the sandbox user (ulimit -u). Default 64. */
  maxProcesses?: number
  /** Allow outbound network (default: denied where the backend supports it). */
  network?: boolean
  /**
   * Extra environment variables to pass through (deny-by-default — only the
   * base allowlist + these + `allowEnv` survive scrubbing).
   */
  env?: Record<string, string>
  /** Ambient environment variable names to keep in addition to the allowlist. */
  allowEnv?: string[]
  /** Cap on captured stdout/stderr per stream in bytes. Default 1 MiB. */
  maxOutputBytes?: number
}

export interface SandboxResult {
  ok: boolean
  exitCode: number | null
  /** Termination signal, e.g. SIGTERM / SIGKILL / SIGXCPU. */
  signal: string | null
  stdout: string
  stderr: string
  stdoutTruncated: boolean
  stderrTruncated: boolean
  durationMs: number
  /** True when the wall-clock timeout fired and the process was killed. */
  timedOut: boolean
  /** The backend that actually enforced this run. */
  isolation: IsolationLevel
  /** Environment variables dropped by scrubbing (names only — never values). */
  droppedEnv: string[]
  /** Spawn failure (e.g. command not found). */
  error?: string
}

export interface SandboxBackend {
  isolation: IsolationLevel
  /** Whether the OS can deny outbound network (sandbox-exec/bwrap). */
  canDenyNetwork: boolean
  /** Whether the OS confines file writes to the sandbox root. */
  canConfineWrites: boolean
}
