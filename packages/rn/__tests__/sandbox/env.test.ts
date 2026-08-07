import { scrubEnv } from '../../src/sandbox/env'

describe('scrubEnv', () => {
  it('keeps the base allowlist', () => {
    const { env, dropped } = scrubEnv({ PATH: '/usr/bin:/bin', HOME: '/home/user', LANG: 'en_US.UTF-8', TMPDIR: '/tmp' })
    expect(env.PATH).toBe('/usr/bin:/bin')
    expect(env.HOME).toBe('/home/user')
    expect(env.LANG).toBe('en_US.UTF-8')
    expect(env.TMPDIR).toBe('/tmp')
    expect(dropped).toEqual([])
  })

  it('drops credential-shaped ambient vars by default', () => {
    const source: NodeJS.ProcessEnv = {
      PATH: '/usr/bin',
      HOME: '/home/user',
      AWS_SECRET_ACCESS_KEY: 'AKIA…',
      GITHUB_TOKEN: 'ghp_…',
      NPM_TOKEN: 'npm_…',
      OPENAI_API_KEY: 'sk-…',
      SSH_AUTH_SOCK: '/tmp/ssh',
    }
    const { env, dropped } = scrubEnv(source)
    for (const secret of ['AWS_SECRET_ACCESS_KEY', 'GITHUB_TOKEN', 'NPM_TOKEN', 'OPENAI_API_KEY', 'SSH_AUTH_SOCK']) {
      expect(env).not.toHaveProperty(secret)
      expect(dropped).toContain(secret)
    }
  })

  it('drops unknown ambient vars (deny-by-default)', () => {
    const { env } = scrubEnv({ PATH: '/usr/bin', HOME: '/home/user', IRRELEVANT_BACKGROUND: 'x', FOO_BAR: 'y' })
    expect(env).not.toHaveProperty('IRRELEVANT_BACKGROUND')
    expect(env).not.toHaveProperty('FOO_BAR')
  })

  it('passes through explicitly allowed vars', () => {
    const { env } = scrubEnv({ PATH: '/usr/bin', HOME: '/home/user', MY_FLAG: '1', NODE_ENV: 'test' }, { allowEnv: ['MY_FLAG', 'NODE_ENV'] })
    expect(env.MY_FLAG).toBe('1')
    expect(env.NODE_ENV).toBe('test')
  })

  it('explicit env overrides win over the secret pattern', () => {
    const { env, dropped } = scrubEnv({ PATH: '/usr/bin', HOME: '/home/user' }, { env: { SANDBOX_SECRET: 'ok-to-pass' } })
    expect(env.SANDBOX_SECRET).toBe('ok-to-pass')
    // A var re-added via env is removed from the dropped report — it is not dropped.
    expect(dropped).not.toContain('SANDBOX_SECRET')
  })

  it('drops an ambient secret even when allowlisted unless re-provided via env', () => {
    const { env, dropped } = scrubEnv({ PATH: '/usr/bin', HOME: '/home/user', MY_API_KEY: 'ambient-secret' }, { allowEnv: ['MY_API_KEY'] })
    expect(env.MY_API_KEY).toBeUndefined()
    expect(dropped).toContain('MY_API_KEY')
    const overridden = scrubEnv({ PATH: '/usr/bin', HOME: '/home/user', MY_API_KEY: 'ambient-secret' }, { env: { MY_API_KEY: 'fresh-value' } })
    expect(overridden.env.MY_API_KEY).toBe('fresh-value')
    expect(overridden.dropped).not.toContain('MY_API_KEY')
  })

  it('never leaks values in the dropped list', () => {
    const { dropped } = scrubEnv({ PATH: '/usr/bin', HOME: '/home/user', GITHUB_TOKEN: 'super-secret-value' })
    expect(dropped).toEqual(['GITHUB_TOKEN'])
    expect(dropped.join(' ')).not.toContain('super-secret-value')
  })
})
