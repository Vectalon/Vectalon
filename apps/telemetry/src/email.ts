/**
 * Support-bundle email forwarding (Resend, via plain fetch — no SDK).
 *
 * A support upload should reach the support address as a structured bug
 * report instead of a 10-message back-and-forth. Requires RESEND_API_KEY;
 * when it is absent the bundle is still stored (and surfaced in the
 * dashboard) with emailed:false so nothing is lost.
 */
import type { SupportBundle } from './types'

export interface EmailResult {
  sent: boolean
  error?: string
}

export interface EmailConfig {
  apiKey?: string
  from?: string
  to?: string
}

export const DEFAULT_SUPPORT_TO = 'neofaceless22@gmail.com'
export const DEFAULT_SUPPORT_FROM = 'Vectalon Support <support@vectalon.dev>'

function summarize(bundle: SupportBundle): string {
  const lines = [
    `Support bundle ${bundle.token}`,
    `Submitted: ${new Date(bundle.timestamp ?? Date.now()).toISOString()}`,
    `vectalon version: ${bundle.version || 'unknown'}`,
    `node: ${bundle.nodeVersion || 'unknown'}`,
    `os: ${bundle.os || 'unknown'}`,
  ]
  const pkg = bundle.packageJson
  if (pkg && typeof pkg === 'object') {
    const p = pkg as Record<string, unknown>
    lines.push(`project: ${String(p.name || '?')}@${String(p.version || '?')}`)
  }
  const queue = bundle.errorQueue || []
  if (queue.length > 0) {
    lines.push(`queued errors: ${queue.length}`)
    for (const e of queue.slice(0, 5)) {
      lines.push(`  - ${e.command || ''}${e.context ? ` (${e.context})` : ''}: ${e.message.slice(0, 160)}`)
    }
  }
  lines.push(`log lines: ${(bundle.logs || []).length}`)
  lines.push(`.vectalon entries: ${(bundle.vectalonState || []).length}`)
  lines.push('')
  lines.push('The full (sanitized) bundle is attached.')
  return lines.join('\n')
}

/** Send the bundle to the support address via Resend. Never throws. */
export async function sendSupportEmail(
  bundle: SupportBundle,
  config: EmailConfig = {}
): Promise<EmailResult> {
  const apiKey = config.apiKey || process.env.RESEND_API_KEY
  if (!apiKey) {
    return { sent: false, error: 'no RESEND_API_KEY configured — bundle stored, not emailed' }
  }
  const to = config.to || process.env.SUPPORT_TO || DEFAULT_SUPPORT_TO
  const from = config.from || process.env.SUPPORT_FROM || DEFAULT_SUPPORT_FROM
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to,
        subject: `Vectalon support bundle ${bundle.token}`,
        text: summarize(bundle),
        attachments: [
          {
            filename: `${bundle.token}.json`,
            content: Buffer.from(JSON.stringify(bundle, null, 2), 'utf-8').toString('base64'),
          },
        ],
      }),
      signal: AbortSignal.timeout(15_000),
    })
    if (res.ok) return { sent: true }
    return { sent: false, error: `Resend ${res.status}: ${(await res.text()).slice(0, 300)}` }
  } catch (err) {
    return { sent: false, error: err instanceof Error ? err.message : String(err) }
  }
}
