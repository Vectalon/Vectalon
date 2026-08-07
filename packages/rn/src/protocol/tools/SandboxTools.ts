/**
 * SandboxTools — MCP tools for sandboxed code execution
 * Business Source License 1.1 (BSL-1.1)
 *
 * `sandbox_run` executes a command inside the strongest isolation backend
 * available on this machine (sandbox-exec on macOS, bwrap on Linux, process
 * fallback): scrubbed environment (deny-by-default), writes confined to the
 * sandbox root, network denied by default, bounded by wall-clock timeout and
 * optional CPU/memory limits. The result reports the backend used and exactly
 * which env vars were dropped, so agents can make trust decisions about
 * auto-executed code.
 */

import { ToolRegistry } from './base'
import { mcpTool } from './decorators'
import { runSandboxed, detectBackend } from '../../sandbox'

const SCHEMA = {
  type: 'object',
  properties: {
    command: { type: 'string', description: 'Command to run inside the sandbox (e.g. node, jest, npm)' },
    args: { type: 'array', items: { type: 'string' }, description: 'Arguments for the command' },
    root: { type: 'string', description: 'Sandbox root — the working directory and (on macOS/Linux) the only writable location. Must exist.' },
    timeoutMs: { type: 'number', description: 'Wall-clock timeout in ms (default 30000)' },
    cpuSeconds: { type: 'number', description: 'CPU time limit in seconds' },
    memoryMb: { type: 'number', description: 'Virtual memory limit in MB' },
    network: { type: 'boolean', description: 'Allow outbound network (default: denied where the backend supports it)' },
    allowEnv: { type: 'array', items: { type: 'string' }, description: 'Ambient env var names to keep (deny-by-default otherwise)' },
    env: { type: 'object', additionalProperties: { type: 'string' }, description: 'Explicit env vars to pass into the sandbox' },
  },
  required: ['command', 'root'],
}

export class SandboxTools extends ToolRegistry {
  @mcpTool(
    'sandbox_run',
    'Execute a command inside an isolated sandbox with no ambient authority: scrubbed environment (deny-by-default, secrets dropped), writes confined to the sandbox root (OS-enforced on macOS/Linux), network denied by default, bounded by a wall-clock timeout and optional CPU/memory limits. Use for running generated code, tests, and scripts safely. Returns the backend used, dropped env var names, exit code, and captured output.',
    SCHEMA
  )
  async sandboxRunTool(args: Record<string, unknown>): Promise<string> {
    const command = args.command
    if (typeof command !== 'string' || !command.trim()) {
      throw new Error('sandbox_run requires a `command` string')
    }
    const root = args.root
    if (typeof root !== 'string' || !root.trim()) {
      throw new Error('sandbox_run requires an explicit `root` directory — it never defaults to the current working directory')
    }

    const rawArgs = args.args
    const commandArgs = Array.isArray(rawArgs) ? rawArgs.filter((a): a is string => typeof a === 'string') : []

    const num = (v: unknown, name: string): number | undefined => {
      if (typeof v === 'number' && Number.isFinite(v)) return v
      if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v)
      if (v !== undefined && v !== null) throw new Error(`sandbox_run: invalid ${name}: expected a number`)
      return undefined
    }
    const allowEnv = Array.isArray(args.allowEnv) ? args.allowEnv.filter((a): a is string => typeof a === 'string') : undefined
    const env = args.env && typeof args.env === 'object' && !Array.isArray(args.env)
      ? (args.env as Record<string, string>)
      : undefined

    const result = await runSandboxed(command.trim(), commandArgs, {
      root: root.trim(),
      timeoutMs: num(args.timeoutMs, 'timeoutMs'),
      cpuSeconds: num(args.cpuSeconds, 'cpuSeconds'),
      memoryMb: num(args.memoryMb, 'memoryMb'),
      network: args.network === true,
      allowEnv,
      env,
    })

    return JSON.stringify(result, null, 2)
  }

  @mcpTool(
    'sandbox_backend',
    'Report the sandbox isolation backend available on this machine (sandbox-exec on macOS, bwrap on Linux, or process fallback) and whether it can deny network / confine file writes.',
    { type: 'object', properties: {} }
  )
  async sandboxBackendTool(): Promise<string> {
    return JSON.stringify(detectBackend(), null, 2)
  }
}
