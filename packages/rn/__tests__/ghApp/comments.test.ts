/**
 * vectalon gh-app — comment upsert hermetic tests: list → marker match →
 * PATCH, or POST when absent, all over a stubbed fetch.
 * Business Source License 1.1 (BSL-1.1)
 */
import { upsertCommentViaApi, type CommentApi } from '../../src/ghApp/comments'
import { PR_REVIEW_MARKER } from '../../src/prReview'

function stubResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response
}

interface Call {
  url: string
  method?: string
  body?: string
  auth?: string
}

function makeApi(handler: (call: Call) => Response): { api: CommentApi; calls: Call[] } {
  const calls: Call[] = []
  const api: CommentApi = {
    fetchImpl: (async (url: string, init?: RequestInit) => {
      const headers = init?.headers as Record<string, string> | undefined
      const call: Call = { url, method: init?.method, body: init?.body as string | undefined, auth: headers?.Authorization }
      calls.push(call)
      return handler(call)
    }) as typeof fetch,
    token: 'inst-token',
    owner: 'acme',
    repo: 'demo-app',
    apiBase: 'https://api.example.test',
  }
  return { api, calls }
}

const markerBody = `<!-- ${PR_REVIEW_MARKER} -->\n\n## 🤖 Vectalon — PR Review`

describe('upsertCommentViaApi', () => {
  it('POSTs a fresh comment when no marker comment exists', async () => {
    const { api, calls } = makeApi((call) => {
      if (call.url.includes('/issues/12/comments?per_page=100') && !call.method) return stubResponse([])
      if (call.url.endsWith('/issues/12/comments') && call.method === 'POST') return stubResponse({ id: 555 })
      return stubResponse({})
    })

    const id = await upsertCommentViaApi(api, 12, markerBody)
    expect(id).toBe(555)
    expect(calls.filter(c => c.method === 'POST')).toHaveLength(1)
    const post = calls.find(c => c.method === 'POST')!
    expect(post.url).toBe('https://api.example.test/repos/acme/demo-app/issues/12/comments')
    expect(JSON.parse(post.body!)).toEqual({ body: markerBody })
    expect(post.auth).toBe('Bearer inst-token')
  })

  it('PATCHes the existing marker comment instead of creating a new one', async () => {
    const { api, calls } = makeApi((call) => {
      if (call.url.includes('/issues/12/comments?per_page=100') && !call.method) {
        return stubResponse([{ id: 444, body: 'other', }, { id: 333, body: markerBody + '\nolder run' }])
      }
      if (call.url.includes('/issues/comments/333') && call.method === 'PATCH') return stubResponse({ id: 333 })
      return stubResponse({})
    })

    const id = await upsertCommentViaApi(api, 12, markerBody + '\nnew run')
    expect(id).toBe(333)
    const patch = calls.find(c => c.method === 'PATCH')!
    expect(patch.url).toBe('https://api.example.test/repos/acme/demo-app/issues/comments/333')
    expect(JSON.parse(patch.body!)).toEqual({ body: markerBody + '\nnew run' })
    expect(calls.filter(c => c.method === 'POST')).toHaveLength(0)
  })

  it('throws when the list fails', async () => {
    const { api } = makeApi(() => stubResponse({ message: 'bad token' }, 403))
    await expect(upsertCommentViaApi(api, 12, markerBody)).rejects.toThrow('HTTP 403')
  })
})
