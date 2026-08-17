/**
 * vectalon gh-app — end-to-end hermetic tests. The webhook→mirror→review→
 * comment pipeline runs against a REAL temporary git repo (git only — no
 * network); the GitHub API is a stubbed fetch. The server routes are tested
 * over real HTTP on an ephemeral port.
 * Business Source License 1.1 (BSL-1.1)
 */
import { execFileSync } from 'child_process'
import { createHmac, generateKeyPairSync } from 'crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { processPullRequestWebhook, runGhAppServer, silentLog, type GhAppRuntime, type MirrorOps } from '../../src/ghApp'
import { PR_REVIEW_MARKER } from '../../src/prReview'

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const PEM = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()

function git(dir: string, ...args: string[]): void {
  execFileSync('git', args, { cwd: dir, stdio: 'pipe' })
}

/** A real git repo: base on main, a feature branch introducing findings. */
function makeRepo(): string {
  const root = mkdtempSync(join(tmpdir(), 'vectalon-ghapp-'))
  // Pin the initial branch to `main` so the diff resolution's `main...HEAD`
  // base ref resolves identically on every machine — without `-b`, the repo
  // inherits the runner's `init.defaultBranch` (master on CI Ubuntu), the
  // merge-base diff silently comes up empty, and the review degrades to
  // "no diff" (commentPosted stays false).
  git(root, 'init', '-q', '-b', 'main')
  git(root, 'config', 'user.email', 't@t')
  git(root, 'config', 'user.name', 't')
  git(root, 'remote', 'add', 'origin', 'https://github.com/acme/demo-app.git')

  const write = (rel: string, content: string) => {
    const idx = rel.lastIndexOf('/')
    if (idx > 0) mkdirSync(join(root, rel.slice(0, idx)), { recursive: true })
    writeFileSync(join(root, rel), content)
  }

  write('package.json', JSON.stringify({ name: 'demo-app', version: '1.0.0', dependencies: { react: '18.3.1', 'react-native': '0.76.5' } }, null, 2) + '\n')
  write('src/App.tsx', "import { View } from 'react-native'\nexport const App = () => <View />\n")
  git(root, 'add', '-A')
  git(root, 'commit', '-qm', 'base')
  git(root, 'update-ref', 'refs/remotes/origin/main', 'HEAD')

  git(root, 'checkout', '-qb', 'feature/cart')
  // A known base Health Score → deterministic health impact.
  write('docs/vectalon/score/report.json', JSON.stringify({ overall: 82 }, null, 2) + '\n')
  // Findings: render-phase setState (perf), a live secret (security), untested files (testing).
  write('src/App.tsx', "import { View } from 'react-native'\nexport const App = () => {\n  setLoading(true)\n  return <View />\n}\n")
  write('src/api/client.ts', "export const client = {\n  apiKey: 'sk_live_1234567890abcdef',\n}\n")
  write('src/hooks/useCart.ts', 'export function useCart() {\n  return { items: [] }\n}\n')
  git(root, 'add', '-A')
  git(root, 'commit', '-qm', 'add cart')
  return root
}

function stubResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response
}

const WEBHOOK = {
  action: 'opened',
  pull_request: { number: 12, title: 'Add cart', head: { sha: 'deadbeef', ref: 'feature/cart' }, base: { ref: 'main' } },
  repository: { owner: { login: 'acme' }, name: 'demo-app' },
  installation: { id: 987 },
}

describe('processPullRequestWebhook', () => {
  let repo: string
  let workspace: string

  beforeEach(() => {
    repo = makeRepo()
    workspace = mkdtempSync(join(tmpdir(), 'vectalon-ghapp-ws-'))
  })
  afterEach(() => {
    rmSync(repo, { recursive: true, force: true })
    rmSync(workspace, { recursive: true, force: true })
  })

  function runtime(fetchImpl: typeof fetch, mirrorOps: MirrorOps): GhAppRuntime {
    return {
      appId: '12345',
      privateKeyPem: PEM,
      webhookSecret: 'secret',
      workspace,
      fetchImpl,
      mirrorOps,
      log: silentLog,
    }
  }

  it('reviews a pull_request webhook end-to-end and posts the review comment', async () => {
    const calls: Array<{ url: string; method?: string; body?: string }> = []
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      calls.push({ url, method: init?.method, body: init?.body as string | undefined })
      if (url.includes('/app/installations/987/access_tokens')) return stubResponse({ token: 'inst-token' })
      if (url.includes('/issues/12/comments?per_page=100') && !init?.method) return stubResponse([])
      if (url.endsWith('/issues/12/comments') && init?.method === 'POST') return stubResponse({ id: 777 })
      return stubResponse({})
    }) as typeof fetch

    const mirrorOps: MirrorOps = {
      ensureMirror: async () => repo,
      fetchPrHead: async () => {},
    }

    const result = await processPullRequestWebhook(WEBHOOK, runtime(fetchImpl, mirrorOps))

    expect(result.status).toBe('reviewed')
    if (result.status !== 'reviewed') return
    const report = result.report as { verdict: string; issues: { message: string }[]; commentPosted: boolean; number: number }

    // The real prReview pipeline ran over the mirror checkout.
    expect(report.number).toBe(12)
    expect(report.commentPosted).toBe(true)
    expect(report.issues.length).toBeGreaterThanOrEqual(3) // perf + security + testing

    // The comment went through the app's installation token (marker-upsert POST).
    const post = calls.find(c => c.method === 'POST' && c.url.endsWith('/issues/12/comments'))
    expect(post).toBeDefined()
    const commentBody = JSON.parse(post!.body!) as { body: string }
    expect(commentBody.body).toContain(`<!-- ${PR_REVIEW_MARKER} -->`)
    expect(commentBody.body).toContain('## 🤖 Vectalon — PR Review')
    expect(commentBody.body).toContain('Health impact: 82 →')
    expect(commentBody.body).toMatch(/Security|sk_live/i)
    expect(commentBody.body).toMatch(/Performance|render/i)

    // The report was written into the mirror.
    const reportJson = JSON.parse(readFileSync(join(repo, 'docs', 'vectalon', 'pr', 'report.json'), 'utf-8'))
    expect(reportJson.number).toBe(12)
  })

  it('skips non-reviewable events', async () => {
    const result = await processPullRequestWebhook({ ...WEBHOOK, action: 'closed' }, runtime(async () => stubResponse({}), { ensureMirror: async () => repo, fetchPrHead: async () => {} }))
    expect(result.status).toBe('skip')
  })

  it('skips when no installation id is available', async () => {
    const { installation: _drop, ...noInstall } = WEBHOOK
    const result = await processPullRequestWebhook(
      noInstall,
      runtime(async () => stubResponse({}), { ensureMirror: async () => repo, fetchPrHead: async () => {} })
    )
    expect(result.status).toBe('skip')
    expect(result.status === 'skip' && result.reason).toContain('installation')
  })

  it('surfaces mirror failures instead of posting a partial review', async () => {
    const mirrorOps: MirrorOps = {
      ensureMirror: async () => {
        throw new Error('clone failed')
      },
      fetchPrHead: async () => {},
    }
    await expect(processPullRequestWebhook(WEBHOOK, runtime(async () => stubResponse({ token: 't' }), mirrorOps))).rejects.toThrow('clone failed')
  })
})

describe('runGhAppServer', () => {
  it('serves /health, verifies signatures, and dispatches reviewable webhooks', async () => {
    const processed: unknown[] = []
    const server = await runGhAppServer(
      { appId: '1', privateKeyPem: PEM, webhookSecret: 'secret', workspace: '/tmp' },
      0,
      async (payload) => {
        processed.push(payload)
        return { status: 'reviewed', root: '/tmp', report: { verdict: 'approved' } }
      }
    )
    const base = `http://localhost:${server.port}`
    const body = JSON.stringify(WEBHOOK)
    const sig = `sha256=${createHmac('sha256', 'secret').update(body).digest('hex')}`

    try {
      // Health.
      const health = await fetch(`${base}/health`)
      expect(health.status).toBe(200)
      expect(((await health.json()) as { ok: boolean }).ok).toBe(true)

      // Bad signature → 401 before any processing.
      const bad = await fetch(`${base}/webhook`, {
        method: 'POST',
        body,
        headers: { 'x-hub-signature-256': 'sha256=' + '0'.repeat(64) },
      })
      expect(bad.status).toBe(401)

      // Valid signature, reviewable → acked and dispatched.
      const ok = await fetch(`${base}/webhook`, {
        method: 'POST',
        body,
        headers: { 'x-hub-signature-256': sig },
      })
      expect(ok.status).toBe(200)
      expect(((await ok.json()) as { processing: boolean }).processing).toBe(true)
      expect(processed).toHaveLength(1)

      // Valid signature, non-reviewable action → acked, skipped.
      const closedBody = JSON.stringify({ ...WEBHOOK, action: 'closed' })
      const closedSig = `sha256=${createHmac('sha256', 'secret').update(closedBody).digest('hex')}`
      const closed = await fetch(`${base}/webhook`, {
        method: 'POST',
        body: closedBody,
        headers: { 'x-hub-signature-256': closedSig },
      })
      expect(closed.status).toBe(200)
      expect(((await closed.json()) as { processing: boolean }).processing).toBe(false)
      expect(processed).toHaveLength(1) // still only the reviewable one

      // Unknown path → 404.
      const nf = await fetch(`${base}/nope`)
      expect(nf.status).toBe(404)
    } finally {
      await server.close()
    }
  })
})
