/**
 * vectalon gh-app — the Vectalon GitHub App (P0 roadmap item 6).
 * Business Source License 1.1 (BSL-1.1)
 *
 * `vc gh-app` runs the distribution mechanism: a small webhook server that
 * turns every pull_request into a deterministic `vc pr` review, posted back
 * by the app itself. Register a GitHub App once (app id + private key +
 * webhook secret), point the webhook at POST /webhook, and every PR after
 * that demonstrates value — GitHub → Vectalon App → Repository Intelligence
 * → PR analysis → Review → Fix → Verification.
 *
 * Configuration (env):
 *   GITHUB_APP_ID              — the GitHub App id
 *   GITHUB_APP_PRIVATE_KEY     — path to the app's .pem private key
 *   GITHUB_WEBHOOK_SECRET      — the webhook secret (HMAC verification)
 *   GITHUB_APP_INSTALLATION_ID — optional fallback installation id
 *   GITHUB_WEBHOOK_PORT        — default port (4567)
 */
import { existsSync, readFileSync } from 'fs'
import { join, resolve } from 'path'
import pc from 'picocolors'
import { printCarbonReport, dim } from '../carbon'
import { processPullRequestWebhook, runGhAppServer, type GhAppLog } from '../../ghApp'

export interface GhAppCommandOptions {
  /** Run the webhook server (default). */
  listen?: boolean
  /** Process one webhook payload JSON file and exit (hermetic / one-shot). */
  process?: string
  /** Port for the webhook server. */
  port?: number
  /** Workspace for repo mirrors + reports. */
  dir?: string
  /** Print machine-readable output. */
  json?: boolean
}

function env(name: string): string | undefined {
  const v = process.env[name]
  return v && v.trim().length > 0 ? v.trim() : undefined
}

function configError(name: string): string {
  return `Missing ${name} — set it in the environment (see 'vectalon gh-app --help').`
}

export async function ghAppCommand(directory: string, options: GhAppCommandOptions): Promise<void> {
  const root = resolve(directory || process.cwd())
  const appId = env('GITHUB_APP_ID')
  const keyPath = env('GITHUB_APP_PRIVATE_KEY')
  const webhookSecret = env('GITHUB_WEBHOOK_SECRET')
  const installationId = env('GITHUB_APP_INSTALLATION_ID')
  const workspace = resolve(options.dir || env('GITHUB_APP_WORKSPACE') || join(root, '.vectalon', 'ghapp'))

  const missing = [
    appId ? null : 'GITHUB_APP_ID',
    keyPath ? null : 'GITHUB_APP_PRIVATE_KEY',
    webhookSecret ? null : 'GITHUB_WEBHOOK_SECRET',
  ].filter((x): x is string => x !== null)
  if (missing.length > 0) {
    process.stderr.write(pc.red(missing.map(configError).join('\n')) + '\n')
    process.exitCode = 1
    return
  }
  if (!existsSync(keyPath!)) {
    process.stderr.write(pc.red(`GITHUB_APP_PRIVATE_KEY path not found: ${keyPath}\n`))
    process.exitCode = 1
    return
  }
  const privateKeyPem = readFileSync(keyPath!, 'utf-8')
  const log: GhAppLog = {
    info: (m) => console.log(pc.dim(m)),
    warn: (m) => console.log(pc.yellow(m)),
    error: (m) => console.log(pc.red(m)),
  }

  // One-shot: process a saved webhook payload and exit.
  if (options.process) {
    const file = resolve(options.process)
    if (!existsSync(file)) {
      process.stderr.write(pc.red(`Webhook payload file not found: ${file}\n`))
      process.exitCode = 1
      return
    }
    const payload = JSON.parse(readFileSync(file, 'utf-8')) as Record<string, unknown>
    const result = await processPullRequestWebhook(payload as never, {
      appId: appId!,
      privateKeyPem,
      webhookSecret: webhookSecret!,
      defaultInstallationId: installationId,
      workspace,
      log,
    })
    if (options.json) {
      process.stdout.write(JSON.stringify(result, null, 2) + '\n')
      return
    }
    if (result.status === 'skip') {
      printCarbonReport({
        title: 'vectalon gh-app — one-shot webhook',
        verdict: 'skip',
        lines: [`event: skipped (${result.reason})`],
        reportPath: join(workspace, 'webhook-last.json'),
        root,
      })
      return
    }
    const r = result.report as { verdict?: string; issues?: unknown[]; commentPosted?: boolean; number?: number }
    printCarbonReport({
      title: 'vectalon gh-app — one-shot webhook',
      verdict: r.verdict ?? 'ok',
      lines: [
        `PR #${r.number ?? '—'} · verdict ${r.verdict ?? 'ok'}`,
        `issues: ${(r.issues ?? []).length} · comment posted: ${r.commentPosted === true ? 'yes' : 'no'}`,
        `mirror: ${result.root}`,
      ],
      reportPath: join(workspace, 'webhook-last.json'),
      root,
    })
    return
  }

  // Server mode (default).
  const port = options.port ?? Number(env('GITHUB_WEBHOOK_PORT') ?? 4567)
  const server = await runGhAppServer(
    { appId: appId!, privateKeyPem, webhookSecret: webhookSecret!, defaultInstallationId: installationId, workspace, log },
    port
  )

  if (options.json) {
    process.stdout.write(JSON.stringify({ ok: true, port: server.port, workspace }, null, 2) + '\n')
    return
  }
  printCarbonReport({
    title: 'vectalon gh-app — webhook server',
    verdict: 'running',
    lines: [
      'GitHub → Vectalon App → Repository Intelligence → PR analysis → Review → Fix → Verification',
      '',
      `webhook:   POST http://localhost:${server.port}/webhook`,
      `health:    GET  http://localhost:${server.port}/health`,
      `workspace: ${workspace}`,
      `app id:    ${appId}`,
      installationId ? `install:   ${installationId}` : 'install:   from webhook payload',
      '',
      dim('Register this URL as the GitHub App webhook. Every pull_request (opened,'),
      dim('synchronize, reopened, ready_for_review) is HMAC-verified and reviewed'),
      dim('deterministically — zero model calls — and the 🤖 review is posted back'),
      dim('on the PR by the app itself (marker-upserted, so pushes refresh it).'),
    ],
    reportPath: join(workspace, 'server.log'),
    root,
  })
}
