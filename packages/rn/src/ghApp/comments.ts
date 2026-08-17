/**
 * vectalon gh-app — PR comment upsert via the GitHub REST API, as the app.
 * Business Source License 1.1 (BSL-1.1)
 *
 * The app posts reviews with its own installation token (no `gh` CLI, no
 * PAT): list `issues/{n}/comments`, find the one carrying the marker, PATCH
 * it in place; otherwise POST a fresh comment. Re-runs on push therefore
 * update one comment instead of spamming the thread — the same marker-upsert
 * contract as the git adapter's, but over the app's token.
 */
import { PR_REVIEW_MARKER } from '../prReview'

export interface CommentApi {
  fetchImpl: typeof fetch
  token: string
  owner: string
  repo: string
  apiBase?: string
  log?: { info: (m: string) => void; warn: (m: string) => void }
}

const headersFor = (token: string): Record<string, string> => ({
  Authorization: `Bearer ${token}`,
  Accept: 'application/vnd.github+json',
  'User-Agent': 'vectalon-ghapp',
  'X-GitHub-Api-Version': '2022-11-28',
  'Content-Type': 'application/json',
})

interface CommentItem {
  id?: number
  body?: string
}

/** List PR review comments (issues/comments — the PR thread). */
export async function listComments(api: CommentApi, number: number): Promise<CommentItem[]> {
  const base = api.apiBase ?? 'https://api.github.com'
  const res = await api.fetchImpl(`${base}/repos/${api.owner}/${api.repo}/issues/${number}/comments?per_page=100`, {
    headers: headersFor(api.token),
  })
  if (!res.ok) {
    api.log?.warn(`Listing PR comments failed: HTTP ${res.status}`)
    throw new Error(`GitHub comment list failed (HTTP ${res.status})`)
  }
  return (await res.json()) as CommentItem[]
}

/** Post or marker-update one review comment. Returns the comment id used. */
export async function upsertCommentViaApi(api: CommentApi, number: number, body: string): Promise<number> {
  const base = api.apiBase ?? 'https://api.github.com'
  const marker = `<!-- ${PR_REVIEW_MARKER} -->`
  const existing = await listComments(api, number)
  const mine = existing.find(c => (c.body ?? '').includes(marker))

  if (mine?.id) {
    const res = await api.fetchImpl(`${base}/repos/${api.owner}/${api.repo}/issues/comments/${mine.id}`, {
      method: 'PATCH',
      headers: headersFor(api.token),
      body: JSON.stringify({ body }),
    })
    if (!res.ok) throw new Error(`GitHub comment update failed (HTTP ${res.status})`)
    api.log?.info(`Updated review comment #${mine.id} on PR #${number}`)
    return mine.id
  }

  const res = await api.fetchImpl(`${base}/repos/${api.owner}/${api.repo}/issues/${number}/comments`, {
    method: 'POST',
    headers: headersFor(api.token),
    body: JSON.stringify({ body }),
  })
  if (!res.ok) throw new Error(`GitHub comment create failed (HTTP ${res.status})`)
  const created = (await res.json()) as { id?: number }
  api.log?.info(`Posted review comment #${created.id ?? '?'} on PR #${number}`)
  return created.id ?? 0
}
