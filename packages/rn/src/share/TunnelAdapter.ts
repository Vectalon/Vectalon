/**
 * TunnelAdapter — exposes a local share server via a public tunnel (Phase 3).
 *
 * Detects `ngrok` on PATH (primary) or the `localtunnel` npm package
 * (fallback), builds the exact command, and — when neither is installed —
 * degrades to the localhost URL with an explicit warning (per the design
 * doc's edge-case table). Never launches a tunnel implicitly; `--tunnel`
 * must be passed.
 */

import { execFileSync } from 'child_process'

export interface TunnelPlan {
  available: boolean
  tool?: 'ngrok' | 'localtunnel'
  command?: string
  publicUrl?: string
  warning?: string
}

function hasOnPath(bin: string): boolean {
  try {
    execFileSync('which', [bin], { stdio: 'pipe', timeout: 5000 })
    return true
  } catch {
    return false
  }
}

function hasLocalModule(name: string): boolean {
  try {
    require.resolve(name)
    return true
  } catch {
    return false
  }
}

export function planTunnel(localPort: number): TunnelPlan {
  if (hasOnPath('ngrok')) {
    return {
      available: true,
      tool: 'ngrok',
      command: `ngrok http ${localPort}`,
      publicUrl: `https://<ngrok-assigned-url> (from the ngrok process)`,
    }
  }
  if (hasLocalModule('localtunnel')) {
    return {
      available: true,
      tool: 'localtunnel',
      command: `npx localtunnel --port ${localPort}`,
      publicUrl: `https://<localtunnel-assigned-url>.loca.lt`,
    }
  }
  return {
    available: false,
    warning:
      'No tunnel tool detected (ngrok on PATH, or localtunnel installed). Sharing stays on localhost — install ngrok and re-run with --tunnel for a public URL.',
  }
}
