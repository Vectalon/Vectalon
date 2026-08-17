/**
 * vectalon gh-app — auth hermetic tests: RS256 JWT shape + verification, and
 * the installation-token exchange with a stubbed fetch.
 * Business Source License 1.1 (BSL-1.1)
 */
import { generateKeyPairSync, verify } from 'crypto'
import { createAppJwt, getInstallationToken } from '../../src/ghApp/auth'

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const PEM = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()

function stubResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response
}

describe('createAppJwt', () => {
  it('builds a well-formed RS256 JWT with the app id and short expiry', () => {
    const now = 1_700_000_000
    const jwt = createAppJwt('12345', PEM, now)
    const [h, p, s] = jwt.split('.')
    expect(h).toBeDefined()
    expect(p).toBeDefined()
    expect(s).toBeDefined()

    const header = JSON.parse(Buffer.from(h, 'base64url').toString())
    const payload = JSON.parse(Buffer.from(p, 'base64url').toString())
    expect(header).toEqual({ alg: 'RS256', typ: 'JWT' })
    expect(payload.iss).toBe('12345')
    expect(payload.iat).toBe(now - 60) // clock-skew grace
    expect(payload.exp).toBe(now + 600) // 10 minutes
  })

  it('signs with the app private key (verifiable against the public key)', () => {
    const jwt = createAppJwt('12345', PEM)
    const [h, p, s] = jwt.split('.')
    const ok = verify('RSA-SHA256', Buffer.from(`${h}.${p}`), publicKey, Buffer.from(s, 'base64url'))
    expect(ok).toBe(true)
  })

  it('produces different signatures for different app ids', () => {
    expect(createAppJwt('1', PEM)).not.toBe(createAppJwt('2', PEM))
  })
})

describe('getInstallationToken', () => {
  it('exchanges the app JWT for an installation token', async () => {
    const calls: Array<{ url: string; method?: string; auth?: string }> = []
    const fetchImpl = async (url: string, init?: RequestInit) => {
      const headers = init?.headers as Record<string, string> | undefined
      calls.push({ url, method: init?.method, auth: headers?.Authorization })
      return stubResponse({ token: 'inst-token-abc' })
    }

    const token = await getInstallationToken({
      appId: '12345',
      privateKeyPem: PEM,
      installationId: '987',
      fetchImpl: fetchImpl as typeof fetch,
    })

    expect(token).toBe('inst-token-abc')
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe('https://api.github.com/app/installations/987/access_tokens')
    expect(calls[0].method).toBe('POST')
    expect(calls[0].auth).toMatch(/^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/)
  })

  it('honors a custom api base (hermetic mirrors)', async () => {
    const urls: string[] = []
    const fetchImpl = async (url: string) => {
      urls.push(url)
      return stubResponse({ token: 't' })
    }
    await getInstallationToken({ appId: '1', privateKeyPem: PEM, installationId: '2', apiBase: 'https://api.example.test', fetchImpl: fetchImpl as typeof fetch })
    expect(urls[0]).toBe('https://api.example.test/app/installations/2/access_tokens')
  })

  it('throws when the exchange fails', async () => {
    const fetchImpl = async () => stubResponse({ message: 'nope' }, 401)
    await expect(
      getInstallationToken({ appId: '1', privateKeyPem: PEM, installationId: '2', fetchImpl: fetchImpl as typeof fetch })
    ).rejects.toThrow('HTTP 401')
  })

  it('throws when the response has no token', async () => {
    const fetchImpl = async () => stubResponse({})
    await expect(
      getInstallationToken({ appId: '1', privateKeyPem: PEM, installationId: '2', fetchImpl: fetchImpl as typeof fetch })
    ).rejects.toThrow('no token')
  })
})
