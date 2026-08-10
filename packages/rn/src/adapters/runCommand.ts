import { spawn } from 'child_process'
import { logger } from '../cli/logger'

export interface CommandResult {
  success: boolean
  stdout: string
  stderr: string
  exitCode: number
}

export interface CommandEvent {
  /** Full command line, e.g. `yarn lint`. */
  command: string
  /** Working directory the command ran in. */
  cwd: string
  /** Epoch ms when the command was spawned. */
  startedAt: number
  /** Epoch ms when the command finished, or undefined while running. */
  completedAt?: number
  /** Duration in ms once finished. */
  durationMs?: number
  /** Populated only when the command has finished. */
  result?: CommandResult
}

export type CommandListener = (event: CommandEvent) => void

// Module-level command hook so CLI surfaces (feature workflow, selftest, …)
// can show which commands are actually running and their outcomes without
// every call site threading a callback. Mirrors setFileChangeWriter.
let commandListener: CommandListener | null = null

export function setCommandListener(listener: CommandListener | null): void {
  commandListener = listener
}

export function getCommandListener(): CommandListener | null {
  return commandListener
}

export function runCommand(command: string, args: string[], options: { cwd: string; timeout?: number }): Promise<CommandResult> {
  return new Promise((resolve) => {
    logger.info(`$ ${command} ${args.join(' ')}`)
    const startedAt = Date.now()
    commandListener?.({ command: [command, ...args].join(' '), cwd: options.cwd, startedAt })
    const child = spawn(command, args, {
      cwd: options.cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false,
    })

    // Emit the completion event exactly once. On spawn failure Node fires
    // both 'error' AND 'close', so both handlers must share the settled flag
    // or one command would produce two completion events (duplicate feed
    // lines + double-counted summary entries).
    let settled = false
    const emitCompleted = (result: CommandResult) => {
      if (settled) return
      settled = true
      const completedAt = Date.now()
      commandListener?.({
        command: [command, ...args].join(' '),
        cwd: options.cwd,
        startedAt,
        completedAt,
        durationMs: completedAt - startedAt,
        result,
      })
    }

    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (data: Buffer) => {
      stdout += data.toString()
    })

    child.stderr.on('data', (data: Buffer) => {
      stderr += data.toString()
    })

    const timeout = options.timeout ?? 10 * 60 * 1000
    const timer = setTimeout(() => {
      child.kill('SIGTERM')
      stderr += '\n[vectalon] command timed out'
    }, timeout)

    child.on('error', (err) => {
      clearTimeout(timer)
      const message = err.message
      const result: CommandResult = { success: false, stdout, stderr: stderr + '\n' + message, exitCode: 1 }
      emitCompleted(result)
      process.stderr.write(message + '\n')
      resolve(result)
    })

    child.on('close', (code) => {
      clearTimeout(timer)
      const exitCode = code ?? 1
      const result = { success: exitCode === 0, stdout, stderr, exitCode }
      emitCompleted(result)
      resolve(result)
    })
  })
}
