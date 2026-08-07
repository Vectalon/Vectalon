/**
 * Vectalon RN — Self-test activity tracer and sandbox
 * Business Source License 1.1 (BSL-1.1)
 *
 * The ActivityTracer is the "what is this package doing" log: every check
 * records the steps it ran, the shell commands it executed, and the files it
 * created/modified. The Sandbox gives each check an isolated temp directory
 * whose writes are traced automatically, so a self-test never touches the
 * user's project.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { dirname, join, relative } from 'path'
import type { CommandResult, TraceStep, TraceStepKind } from './types'

export class ActivityTracer {
  readonly steps: TraceStep[] = []

  private push(kind: TraceStepKind, message: string, extra?: Partial<TraceStep>): void {
    this.steps.push({ kind, message, ...extra })
  }

  step(message: string): void {
    this.push('step', message)
  }

  warn(message: string): void {
    this.push('warn', message)
  }

  command(command: string, args: string[], cwd: string): void {
    this.push('command', `$ ${command} ${args.join(' ')}`, { command: { command, args, cwd } })
  }

  write(relPath: string, bytes?: number): void {
    this.push('write', `✎ ${relPath}${typeof bytes === 'number' ? ` (${bytes} B)` : ''}`, {
      write: { path: relPath, bytes },
    })
  }

  artifact(relPath: string, summary?: string): void {
    this.push('artifact', `▣ ${relPath}${summary ? ` — ${summary}` : ''}`, { artifact: { path: relPath, summary } })
  }

  counts(): { steps: number; commands: number; writes: number; artifacts: number } {
    return {
      steps: this.steps.length,
      commands: this.steps.filter(s => s.kind === 'command').length,
      writes: this.steps.filter(s => s.kind === 'write').length,
      artifacts: this.steps.filter(s => s.kind === 'artifact').length,
    }
  }

  /** Human-readable activity log (the `.log` file content). */
  format(): string {
    const lines: string[] = []
    for (const s of this.steps) {
      switch (s.kind) {
        case 'command':
          lines.push(`  $ ${s.command!.command} ${s.command!.args.join(' ')}`)
          if (typeof s.command!.exitCode === 'number') {
            lines.push(`    exit ${s.command!.exitCode} (cwd: ${s.command!.cwd})`)
          }
          break
        case 'write':
          lines.push(`  ✎ ${s.write!.path}${typeof s.write!.bytes === 'number' ? ` (${s.write!.bytes} B)` : ''}`)
          break
        case 'artifact':
          lines.push(`  ▣ ${s.artifact!.path}${s.artifact!.summary ? ` — ${s.artifact!.summary}` : ''}`)
          break
        case 'warn':
          lines.push(`  ⚠ ${s.message}`)
          break
        default:
          lines.push(`  · ${s.message}`)
      }
    }
    return lines.join('\n')
  }
}

/**
 * Isolated temp workspace for one check. Every file written through it is
 * recorded in the check's activity trace, making modifications visible to
 * clients. All content is removed when the run finishes.
 */
export class Sandbox {
  readonly root: string

  constructor(private readonly trace?: ActivityTracer, prefix = 'vectalon-selftest-') {
    this.root = mkdtempSync(join(tmpdir(), prefix))
  }

  /** Absolute path of a relative path inside the sandbox. */
  path(relPath: string): string {
    return join(this.root, relPath)
  }

  /** Create (recursively) a directory inside the sandbox and return its path. */
  dir(relPath: string): string {
    const p = this.path(relPath)
    mkdirSync(p, { recursive: true })
    return p
  }

  /** Write a file inside the sandbox (traced) and return its absolute path. */
  file(relPath: string, content: string): string {
    const p = this.path(relPath)
    mkdirSync(dirname(p), { recursive: true })
    writeFileSync(p, content)
    this.trace?.write(relPath, Buffer.byteLength(content, 'utf-8'))
    return p
  }

  /** Write a JSON file (traced) and return its absolute path. */
  json(relPath: string, value: unknown): string {
    return this.file(relPath, JSON.stringify(value, null, 2))
  }

  exists(relPath: string): boolean {
    return existsSync(this.path(relPath))
  }

  /** Trace a file the check wrote directly (outside the sandbox helpers). */
  recordWrite(relPath: string): void {
    const abs = relPath.startsWith(this.root) ? relPath : this.path(relPath)
    const shown = relative(this.root, abs)
    this.trace?.write(shown)
  }

  cleanup(): void {
    rmSync(this.root, { recursive: true, force: true })
  }
}

/**
 * Build a traced runCommand: every invocation is recorded in the activity log
 * as a `command` step, and its exit code is appended once it completes. Runs
 * inside the given cwd by default so checks don't touch the user's project.
 */
export function createTracedRunner(
  trace: ActivityTracer,
  defaultCwd: string,
  runner: (command: string, args: string[], options: { cwd: string; timeout?: number }) => Promise<CommandResult>
): (command: string, args: string[], options?: { cwd?: string; timeout?: number }) => Promise<CommandResult> {
  return async (command, args, options = {}) => {
    const cwd = options.cwd || defaultCwd
    trace.command(command, args, cwd)
    const result = await runner(command, args, { cwd, timeout: options.timeout ?? 30_000 })
    const last = trace.steps[trace.steps.length - 1]
    if (last && last.kind === 'command' && last.command) {
      last.command.exitCode = result.exitCode
    }
    if (result.success) {
      trace.step(`exit ${result.exitCode} — success`)
    } else {
      const firstError = (result.stderr || result.stdout || '').split('\n').filter(Boolean).slice(0, 2).join(' ').trim()
      trace.warn(`exit ${result.exitCode} — failed${firstError ? `: ${firstError}` : ''}`)
    }
    return result
  }
}
