import { spawn, type ChildProcess } from 'child_process'
import { McpHttpClient } from './client'
import { portFromUrl, baseUrlFromPort } from './urls'
import { withRetries } from './retry'
import { log } from './output'

export { portFromUrl, baseUrlFromPort }

/**
 * Manages the `vectalon serve --protocol http` child process. The extension
 * prefers an already-running server (config `vectalon.url`); when none is
 * reachable and `vectalon.autoStart` is on, it spawns the CLI in the current
 * workspace and waits for the port banner before reporting connected.
 */

const PORT_BANNER = /rn-vectalon MCP server running on port (\d+)/

export interface ServerHandle {
  client: McpHttpClient
  baseUrl: string
  child: ChildProcess | null
  stop(): void
}

/** True when a server is reachable at the URL. */
export async function isReachable(client: McpHttpClient): Promise<boolean> {
  return client.ping()
}

const SPAWN_TIMEOUT_MS = 20_000
const DEFAULT_SPAWN_ATTEMPTS = 3

/**
 * Spawn `vectalon serve --protocol http --port <port>` with retries (P0-8):
 * up to `attempts` tries with exponential backoff (1s, 2s, …). A flaky first
 * spawn (port race, slow bundler init) no longer leaves the extension dead.
 */
export function spawnServerWithRetry(
  workspaceRoot: string,
  port: number,
  options: { attempts?: number; log?: (msg: string) => void } = {}
): Promise<ServerHandle> {
  const attempts = options.attempts ?? DEFAULT_SPAWN_ATTEMPTS
  const logger = options.log || log
  return withRetries(() => spawnServer(workspaceRoot, port), {
    attempts,
    baseMs: 1_000,
    label: `spawning vectalon serve on port ${port}`,
    log: logger,
  })
}

/**
 * Spawn `vectalon serve --protocol http --port <port>` in the workspace and
 * wait until the port banner appears (or the process exits / times out).
 */
export function spawnServer(
  workspaceRoot: string,
  port: number,
  extraEnv: NodeJS.ProcessEnv = {}
): Promise<ServerHandle> {
  return new Promise((resolve, reject) => {
    const child = spawn('vectalon', ['serve', '--protocol', 'http', '--port', String(port)], {
      cwd: workspaceRoot,
      env: { ...process.env, ...extraEnv, NODE_ENV: 'development' },
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let settled = false
    const finish = (err: Error | null, handle?: ServerHandle): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      child.stderr?.off('data', onStderr)
      child.off('exit', onExit)
      if (err) reject(err)
      else resolve(handle as ServerHandle)
    }

    const onStderr = (data: Buffer | string): void => {
      const text = data.toString()
      log(`[serve] ${text.trimEnd()}`)
      if (PORT_BANNER.test(text) && !settled) {
        const baseUrl = baseUrlFromPort(port)
        finish(null, {
          client: new McpHttpClient(baseUrl),
          baseUrl,
          child,
          stop() {
            finish(null)
            child.kill()
          },
        })
      }
    }

    const onExit = (code: number | null, signal: string | null): void => {
      finish(new Error(`vectalon serve exited (code ${code ?? 'null'}, signal ${signal ?? 'none'})`))
    }

    const timer = setTimeout(() => {
      finish(new Error(`Timed out waiting for vectalon serve on port ${port}`))
    }, SPAWN_TIMEOUT_MS)

    child.stderr?.on('data', onStderr)
    child.once('exit', onExit)
  })
}
