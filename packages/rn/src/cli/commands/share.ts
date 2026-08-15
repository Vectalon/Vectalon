/**
 * vectalon share — Local Share Agent (Phase 3 of Archive & Share).
 * Business Source License 1.1 (BSL-1.1)
 *
 * Spins up an ephemeral static server for an archived build: a self-contained
 * install page with a download link, optional tunnel (ngrok/localtunnel),
 * optional QR, and auto-shutdown after --expires. Free tier. Reports to
 * docs/vectalon/share/ (gitignored).
 */
import { resolve } from 'path'
import { printCarbonReport } from '../carbon'
import { startShare } from '../../share'

export interface ShareCommandOptions {
  build?: string
  flavor?: string
  platform?: string
  port?: number
  host?: string
  tunnel?: boolean
  qr?: boolean
  expires?: string
  json?: boolean
}

/** Parse a duration like "30m", "2h", "90s" into ms. */
export function parseExpires(value?: string): number | undefined {
  if (!value) return undefined
  const m = /^(\d+)(s|m|h)$/.exec(value)
  if (!m) return undefined
  const n = Number(m[1])
  const unit = m[2]
  return n * (unit === 's' ? 1000 : unit === 'm' ? 60_000 : 3_600_000)
}

export async function shareCommand(directory: string, options: ShareCommandOptions): Promise<void> {
  const root = resolve(directory || process.cwd())
  const result = await startShare(root, {
    buildId: options.build,
    flavor: options.flavor,
    platform: options.platform as 'ios' | 'android' | undefined,
    port: options.port,
    host: options.host,
    tunnel: options.tunnel,
    expiresMs: parseExpires(options.expires),
  })

  if (options.json) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n')
    return
  }

  if (!result.ok) {
    printCarbonReport({
      title: 'vectalon share — failed',
      verdict: 'failed',
      lines: [result.error ?? 'Share failed.', ''],
      reportPath: result.reportPath,
      root,
      done: 'Nothing to share — archive a build first.',
    })
    return
  }

  const body: string[] = [
    `Build:  ${result.buildId}`,
    `Local:  ${result.url}`,
  ]
  if (result.tunnel) {
    if (result.tunnel.available) {
      body.push(`Tunnel: ${result.tunnel.tool} — ${result.tunnel.command}`)
      body.push(`Public: ${result.tunnel.publicUrl ?? '(URL from the tunnel process)'}`)
    } else if (result.tunnel.warning) {
      body.push(`Tunnel: ${result.tunnel.warning}`)
    }
  }
  body.push('')
  body.push('Press Ctrl-C to stop the server.')

  printCarbonReport({
    title: 'vectalon share — serving build',
    verdict: 'ok',
    lines: body,
    reportPath: result.reportPath,
    root,
    done: `Install page live at ${result.url} — share the link (or scan the QR) to install.`,
  })

  // Keep the process alive until Ctrl-C / expires.
  await new Promise<void>(resolveStopped => {
    const stop = (): void => {
      result.stop().then(() => {
        resolveStopped()
        process.exit(0)
      })
    }
    process.once('SIGINT', stop)
    process.once('SIGTERM', stop)
  })
}
