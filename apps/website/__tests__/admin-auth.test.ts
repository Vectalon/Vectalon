import {
  DEFAULT_ADMIN_PASSWORD,
  adminPassword,
  adminSessionToken,
  isAdminToken,
} from '../lib/admin-auth'

describe('production admin authentication', () => {
  afterEach(() => {
    delete process.env.ADMIN_PASSWORD
    delete process.env.VERCEL_ENV
  })

  it('fails closed in production when no admin password is configured', () => {
    process.env.VERCEL_ENV = 'production'

    expect(adminPassword()).toBeNull()
    expect(adminSessionToken()).toBeNull()
    expect(isAdminToken(undefined)).toBe(false)
  })

  it('accepts only the configured production credential', () => {
    process.env.VERCEL_ENV = 'production'
    process.env.ADMIN_PASSWORD = 'configured-secret'

    const token = adminSessionToken()
    expect(adminPassword()).toBe('configured-secret')
    expect(token).not.toBeNull()
    expect(isAdminToken(token ?? undefined)).toBe(true)
  })

  it('retains the default only for local development and tests', () => {
    expect(adminPassword()).toBe(DEFAULT_ADMIN_PASSWORD)
  })
})
