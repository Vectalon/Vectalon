/**
 * Sandboxed command execution
 * Business Source License 1.1 (BSL-1.1)
 *
 * `runSandboxed` is the trust foundation for any automation that writes and
 * executes code on behalf of the user (V-1). A command runs inside the
 * strongest isolation backend available on this machine:
 *
 *  - macOS: `sandbox-exec` with a seatbelt profile (writes confined to the
 *    sandbox root, network denied by default)
 *  - Linux: `bwrap` (read-only root bind + network namespace)
 *  - fallback: process-level (scrubbed env + rlimits + sandbox-root cwd)
 *
 * Every run is bounded: wall-clock timeout (SIGTERM → SIGKILL to the process
 * group), output capture caps, and POSIX rlimits. The result reports the
 * backend actually used, what env vars were dropped, and how the process
 * ended — so clients always know the trust level of what ran.
 */

import { spawn } from 'child_process'
import { existsSync, realpathSync } from 'fs'
import { resolve } from 'path'
import { detectBackend, buildMacProfile, buildBwrapArgs } from './backend'
import { scrubEnv } from './env'
import { buildLimitWrapper, buildShellArgs } from './limits'
import type { SandboxOptions, SandboxResult } from './types'

const DEFAULT_TIMEOUT_MS = 30_000
const DEFAULT_MAX_OUTPUT_BYTES = 1024 * 1024
const KILL_GRACE_MS = 500

/**
 * Run a command inside the sandbox. Returns a structured result; never
 * throws — failures surface as `error` / non-zero `exitCode` / `timedOut`.
 */
export async function runSandboxed(command: string, args: string[], options: SandboxOptions): Promise<SandboxResult> {
  const resolvedRoot = resolve(options.root)
  if (!existsSync(resolvedRoot)) {
    return {
      ok: false,
      exitCode: null,
      signal: null,
      stdout: '',
      stderr: '',
      stdoutTruncated: false,
      stderrTruncated: false,
      durationMs: 0,
      timedOut: false,
      isolation: detectBackend().isolation,
      droppedEnv: [],
      error: `sandbox root does not exist: ${resolvedRoot}`,
    }
  }

  // Canonicalize the root so the child's cwd and the OS profile path match
  // exactly (macOS /var → /private/var symlink otherwise splits them).
  const root = realpathSync(resolvedRoot)

  const started = Date.now()
  const { env, dropped } = scrubEnv(process.env, { allowEnv: options.allowEnv, env: options.env })
  const backend = detectBackend()
  const script = buildLimitWrapper(options)
  const shellArgs = buildShellArgs(command, args, script)
  const network = options.network === true

  let spawnCommand = 'sh'
  let spawnArgs = shellArgs
  if (backend.isolation === 'sandbox-exec') {
    spawnCommand = '/usr/bin/sandbox-exec'
    spawnArgs = ['-p', buildMacProfile(root, network), '/bin/sh', ...shellArgs]
  } else if (backend.isolation === 'bwrap') {
    spawnCommand = 'bwrap'
    spawnArgs = [...buildBwrapArgs(root, network), '/bin/sh', ...shellArgs]
  }

  return new Promise<SandboxResult>((resolvePromise) => {
    let stdout = ''
    let stderr = ''
    let stdoutTruncated = false
    let stderrTruncated = false
    let timedOut = false
    let settled = false

    const cap = options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS

    const child = spawn(spawnCommand, spawnArgs, {
      cwd: root,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
      detached: true,
    })

    const finish = (result: SandboxResult): void => {
      if (settled) return
      settled = true
      resolvePromise(result)
    }

    child.stdout?.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf-8')
      const remaining = cap - stdout.length
      if (remaining <= 0) {
        stdoutTruncated = true
        return
      }
      if (text.length > remaining) {
        stdoutTruncated = true
        stdout += text.slice(0, remaining)
      } else {
        stdout += text
      }
    })
    child.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf-8')
      const remaining = cap - stderr.length
      if (remaining <= 0) {
        stderrTruncated = true
        return
      }
      if (text.length > remaining) {
        stderrTruncated = true
        stderr += text.slice(0, remaining)
      } else {
        stderr += text
      }
    })

    // Wall-clock bound: SIGTERM the process group, then SIGKILL after grace.
    // Both timers are tracked so `close` clears them — a stale kill timer must
    // never fire after the pid has been recycled by the OS.
    let killTimer: ReturnType<typeof setTimeout> | undefined
    const timer = setTimeout(() => {
      timedOut = true
      try {
        process.kill(-child.pid!, 'SIGTERM')
      } catch {
        // group already gone — the close handler will settle
      }
      killTimer = setTimeout(() => {
        try {
          process.kill(-child.pid!, 'SIGKILL')
        } catch {
          // already dead
        }
      }, KILL_GRACE_MS)
    }, timeoutMs)

    const cancelTimers = (): void => {
      clearTimeout(timer)
      if (killTimer) clearTimeout(killTimer)
    }

    child.on('error', (err) => {
      cancelTimers()
      finish({
        ok: false,
        exitCode: null,
        signal: null,
        stdout,
        stderr: stderr || err.message,
        stdoutTruncated,
        stderrTruncated,
        durationMs: Date.now() - started,
        timedOut,
        isolation: backend.isolation,
        droppedEnv: dropped,
        error: err.message,
      })
    })

    child.on('close', (code, signal) => {
      cancelTimers()
      finish({
        ok: code === 0 && signal === null,
        exitCode: code,
        signal,
        stdout,
        stderr,
        stdoutTruncated,
        stderrTruncated,
        durationMs: Date.now() - started,
        timedOut,
        isolation: backend.isolation,
        droppedEnv: dropped,
      })
    })
  })
}
