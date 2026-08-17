/**
 * vectalon gh-app — the Vectalon GitHub App (P0 roadmap item 6, "Build the
 * GitHub App"): the distribution mechanism that turns `vc pr` into an
 * install-once, every-PR-gets-reviewed pipeline.
 * Business Source License 1.1 (BSL-1.1)
 *
 *   GitHub → Vectalon App → Repository Intelligence → PR analysis → Review → Fix → Verification
 *
 * A team administrator registers the app once (app id + private key + webhook
 * secret) and points GitHub's webhook at `POST /webhook`. Every
 * pull_request event (opened / synchronize / reopened / ready_for_review) is
 * HMAC-verified, the PR head is fetched into a local mirror, the existing
 * deterministic `runPrReview` pipeline runs over the added lines, and the 🤖
 * review is posted (marker-upserted) back on the PR with the app's own
 * installation token — no `gh` CLI, no personal token, no model calls.
 *
 * The only runtime dependency is Node ≥ 20 (built-in crypto + fetch + http).
 */
import { existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { runCommand } from '../adapters/runCommand'
import { runPrReview, writePrReviewReport } from '../prReview'
import { getInstallationToken } from './auth'
import { upsertCommentViaApi } from './comments'
import { reviewableFields, verifyWebhookSignature, type PullRequestWebhook } from './webhook'

export * from './auth'
export * from './webhook'
export * from './comments'

export interface GhAppLog {
  info: (m: string) => void
  warn: (m: string) => void
  error: (m: string) => void
}

export const silentLog: GhAppLog = { info: () => {}, warn: () => {}, error: () => {} }

/** The mirror-git seam — injectable so hermetic tests never touch the network. */
export interface MirrorOps {
  /** Ensure a clone of owner/repo exists under the workspace; return its root. */
  ensureMirror(owner: string, repo: string, token: string): Promise<string>
  /** Bring the PR head + base branch into the mirror and check out the head. */
  fetchPrHead(root: string, number: number, baseRef: string, token: string): Promise<void>
}

export interface GhAppRuntime {
  appId: string
  privateKeyPem: string
  webhookSecret: string
  /** Fallback installation id when the webhook payload omits `installation`. */
  defaultInstallationId?: string
  /** Where repo mirrors + reports live (default `<cwd>/.vectalon/ghapp`). */
  workspace: string
  apiBase?: string
  fetchImpl?: typeof fetch
  mirrorOps?: MirrorOps
  log?: GhAppLog
}

const run = (cmd: string, args: string[], cwd: string) => runCommand(cmd, args, { cwd, timeout: 120_000 })

/** Default mirror ops: a full clone per repo, PR head + base fetched on demand. */
export function makeMirrorOps(workspace: string): MirrorOps {
  return {
    async ensureMirror(owner, repo, token) {
      const dir = join(workspace, `${owner}__${repo}`)
      if (existsSync(join(dir, '.git'))) return dir
      mkdirSync(workspace, { recursive: true })
      const url = `https://x-access-token:${token}@github.com/${owner}/${repo}.git`
      const out = await run('git', ['clone', '--quiet', url, dir], process.cwd())
      if (!out.success) {
        throw new Error(`Mirror clone failed for ${owner}/${repo}: ${out.stderr.slice(0, 300)}`)
      }
      return dir
    },
    async fetchPrHead(root, number, baseRef) {
      const pr = await run('git', ['fetch', '--quiet', 'origin', `pull/${number}/head:refs/remotes/origin/pr-${number}`], root)
      if (!pr.success) throw new Error(`Fetching PR #${number} head failed: ${pr.stderr.slice(0, 300)}`)
      const base = await run('git', ['fetch', '--quiet', 'origin', `${baseRef}:refs/remotes/origin/${baseRef}`], root)
      if (!base.success) throw new Error(`Fetching base branch '${baseRef}' failed: ${base.stderr.slice(0, 300)}`)
      const co = await run('git', ['checkout', '--quiet', '--detach', `refs/remotes/origin/pr-${number}`], root)
      if (!co.success) throw new Error(`Checking out PR #${number} head failed: ${co.stderr.slice(0, 300)}`)
    },
  }
}

export type GhAppResult =
  | { status: 'skip'; reason: string }
  | { status: 'reviewed'; root: string; report: unknown }

/**
 * Process one pull_request webhook end-to-end: token → mirror → diff → the
 * real `runPrReview` pipeline → comment upsert → report write.
 */
export async function processPullRequestWebhook(payload: PullRequestWebhook, rt: GhAppRuntime): Promise<GhAppResult> {
  const log = rt.log ?? silentLog
  const fields = reviewableFields(payload)
  if (!fields) {
    return { status: 'skip', reason: `event/action not reviewable (${payload.action ?? 'unknown'})` }
  }
  const installationId = String(fields.installationId ?? rt.defaultInstallationId ?? '')
  if (!installationId) {
    return { status: 'skip', reason: 'no installation id in the payload or GITHUB_APP_INSTALLATION_ID' }
  }

  log.info(`Reviewing PR #${fields.number} (${fields.owner}/${fields.repo}) — action ${payload.action}`)
  const token = await getInstallationToken({
    appId: rt.appId,
    privateKeyPem: rt.privateKeyPem,
    installationId,
    fetchImpl: rt.fetchImpl,
    apiBase: rt.apiBase,
    log,
  })

  const ops = rt.mirrorOps ?? makeMirrorOps(rt.workspace)
  const root = await ops.ensureMirror(fields.owner, fields.repo, token)
  await ops.fetchPrHead(root, fields.number, fields.baseRef, token)

  const commenter = async (number: number, body: string): Promise<void> => {
    await upsertCommentViaApi(
      {
        fetchImpl: rt.fetchImpl ?? fetch,
        token,
        owner: fields.owner,
        repo: fields.repo,
        apiBase: rt.apiBase,
        log,
      },
      number,
      body
    )
  }

  const report = await runPrReview(root, { number: fields.number, base: fields.baseRef }, commenter)
  writePrReviewReport(root, report)
  log.info(`PR #${fields.number} reviewed (${report.verdict}) — ${report.issues.length} issues, comment posted: ${report.commentPosted}`)
  return { status: 'reviewed', root, report }
}

// ---------------------------------------------------------------------------
// The webhook server (node:http — no framework, no deps).
// ---------------------------------------------------------------------------

export interface GhAppServer {
  port: number
  close(): Promise<void>
}

const MAX_BODY = 5 * 1024 * 1024

function readRawBody(req: import('http').IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (c: Buffer) => {
      size += c.length
      if (size > MAX_BODY) {
        reject(new Error('webhook body too large'))
        req.destroy()
        return
      }
      chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

function json(res: import('http').ServerResponse, code: number, body: unknown): void {
  const text = JSON.stringify(body)
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(text)
}

/**
 * Run the webhook server. `process` is injectable so tests can assert the
 * handler behavior without a real runtime; it defaults to processPullRequestWebhook.
 */
export async function runGhAppServer(
  rt: GhAppRuntime,
  port: number,
  process_: (payload: PullRequestWebhook) => Promise<GhAppResult> = (p) => processPullRequestWebhook(p, rt)
): Promise<GhAppServer> {
  const log = rt.log ?? silentLog
  const http = await import('http')
  const server = http.createServer((req, res) => {
    void (async () => {
      try {
        const url = new URL(req.url || '/', 'http://localhost')
        if (req.method === 'GET' && url.pathname === '/health') {
          json(res, 200, { ok: true, service: 'vectalon-gh-app' })
          return
        }
        if (req.method === 'POST' && url.pathname === '/webhook') {
          const raw = await readRawBody(req)
          const rawSig = req.headers['x-hub-signature-256']
          const signature = Array.isArray(rawSig) ? rawSig[0] : rawSig
          if (!verifyWebhookSignature(rt.webhookSecret, raw, signature)) {
            json(res, 401, { ok: false, error: 'bad signature' })
            return
          }
          let payload: PullRequestWebhook
          try {
            payload = JSON.parse(raw.toString('utf-8')) as PullRequestWebhook
          } catch {
            json(res, 400, { ok: false, error: 'invalid JSON' })
            return
          }
          if (!reviewableFields(payload)) {
            json(res, 200, { ok: true, processing: false, reason: 'not reviewable' })
            return
          }
          json(res, 200, { ok: true, processing: true })
          // The review runs after the ack so GitHub never sees a slow webhook.
          void process_(payload).catch(err => log.error(`webhook processing failed: ${(err as Error).message}`))
          return
        }
        json(res, 404, { ok: false, error: 'not found' })
      } catch (err) {
        log.error(`webhook request failed: ${(err as Error).message}`)
        if (!res.headersSent) json(res, 500, { ok: false, error: 'internal error' })
        else res.end()
      }
    })()
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, () => resolve())
  })
  const address = server.address()
  const bound = typeof address === 'object' && address ? address.port : port
  log.info(`vectalon gh-app webhook listening on :${bound} — POST /webhook, GET /health`)
  return {
    port: bound,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  }
}
