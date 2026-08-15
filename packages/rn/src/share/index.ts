/**
 * Archive & Share — local sharing orchestrator (Phase 3).
 *
 * `vectalon share --host` resolves an archived build, starts the static
 * server, and (with --tunnel) prints the public URL + QR. Returns a handle
 * the CLI can await on (Ctrl-C or --expires shuts it down); reports to
 * docs/vectalon/share/report.json.
 */

import { mkdirSync, writeFileSync } from 'fs'
import { join, resolve } from 'path'
import { ArchiveStore } from '../archive/ArchiveStore'
import { startShareServer, type ShareServerHandle } from './LocalServer'
import { planTunnel } from './TunnelAdapter'

export interface ShareOptions {
  buildId?: string
  flavor?: string
  platform?: 'ios' | 'android'
  port?: number
  host?: string
  tunnel?: boolean
  expiresMs?: number
  qr?: boolean
}

export interface ShareResult {
  ok: boolean
  error?: string
  url: string
  port: number
  tunnel?: { available: boolean; tool?: string; command?: string; warning?: string; publicUrl?: string }
  buildId: string
  reportPath: string
  stop: () => Promise<void>
}

export const shareDocsDir = (root: string): string => join(root, 'docs', 'vectalon', 'share')

/** Resolve the build to share, then start the server. */
export async function startShare(rootArg: string, options: ShareOptions): Promise<ShareResult> {
  const root = resolve(rootArg)
  const store = new ArchiveStore(root)
  const reportPath = join(shareDocsDir(root), 'report.json')

  const build = options.buildId
    ? store.getBuild(options.buildId)
    : store.resolveLatest({ flavor: options.flavor, platform: options.platform })

  if (!build) {
    const result: ShareResult = {
      ok: false,
      error: 'No archived build found. Run `vectalon archive` first, or pass --build <id>.',
      url: '',
      port: 0,
      buildId: '',
      reportPath,
      stop: async () => undefined,
    }
    writeShareReport(root, result)
    return result
  }

  const handle = await startShareServer({
    build,
    port: options.port ?? 0,
    host: options.host,
    storeRoot: root,
    ...(options.expiresMs ? { expiresMs: options.expiresMs } : {}),
  })

  const tunnel = options.tunnel ? planTunnel(handle.port) : undefined
  const url = tunnel?.available ? (tunnel.publicUrl as string) : handle.url

  const result: ShareResult = {
    ok: true,
    url,
    port: handle.port,
    ...(tunnel ? { tunnel } : {}),
    buildId: build.buildId,
    reportPath,
    stop: handle.close,
  }
  writeShareReport(root, result)
  return result
}

/** Write the share report (report.json + report.md — same surface as every agent). */
export function writeShareReport(root: string, result: ShareResult): void {
  const dir = shareDocsDir(root)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'report.json'), JSON.stringify({ ...result, verdict: shareVerdict(result) }, null, 2) + '\n')
  writeFileSync(join(dir, 'report.md'), renderShareReport(result))
}

/** Map a share outcome to the site's verdict vocabulary. */
export function shareVerdict(result: ShareResult): 'approved' | 'changes-requested' {
  return result.ok ? 'approved' : 'changes-requested'
}

/** Markdown rendering of a share report (matches the JSON, GitHub-renderable). */
export function renderShareReport(result: ShareResult): string {
  const lines: string[] = ['# vectalon share — Local Share', '']
  if (!result.ok) {
    lines.push(`Verdict: **changes-requested**`)
    if (result.error) lines.push('', '## Error', '', result.error)
  } else {
    lines.push(`Verdict: **approved**  ·  Build: \`${result.buildId}\``)
    lines.push(`URL: ${result.url}  ·  Port: ${result.port}`)
    if (result.tunnel) {
      lines.push('', '## Tunnel')
      if (result.tunnel.available && result.tunnel.publicUrl) {
        lines.push(`- Public URL: ${result.tunnel.publicUrl} (via ${result.tunnel.tool})`)
      } else if (result.tunnel.command) {
        lines.push(`- Not running: ${result.tunnel.warning ?? 'no tunnel tool installed'}`)
        lines.push(`- Run manually: \`${result.tunnel.command}\``)
      }
    }
  }
  lines.push('')
  lines.push('> Ephemeral — nothing leaves your machine unless a tunnel is enabled.')
  return lines.join('\n') + '\n'
}

export type { ShareServerHandle }
