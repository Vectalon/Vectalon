import { spawn } from 'child_process'
import { logger } from '../cli/logger'

export interface CommandResult {
  success: boolean
  stdout: string
  stderr: string
  exitCode: number
}

export function runCommand(command: string, args: string[], options: { cwd: string; timeout?: number }): Promise<CommandResult> {
  return new Promise((resolve) => {
    logger.info(`$ ${command} ${args.join(' ')}`)
    const child = spawn(command, args, {
      cwd: options.cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false,
    })

    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (data: Buffer) => {
      const chunk = data.toString()
      stdout += chunk
      process.stdout.write(chunk)
    })

    child.stderr.on('data', (data: Buffer) => {
      const chunk = data.toString()
      stderr += chunk
      process.stderr.write(chunk)
    })

    const timeout = options.timeout ?? 10 * 60 * 1000
    const timer = setTimeout(() => {
      child.kill('SIGTERM')
      stderr += '\n[vectalon] command timed out'
    }, timeout)

    child.on('error', (err) => {
      clearTimeout(timer)
      const message = err.message
      process.stderr.write(message + '\n')
      resolve({ success: false, stdout, stderr: stderr + '\n' + message, exitCode: 1 })
    })

    child.on('close', (code) => {
      clearTimeout(timer)
      const exitCode = code ?? 1
      resolve({ success: exitCode === 0, stdout, stderr, exitCode })
    })
  })
}
