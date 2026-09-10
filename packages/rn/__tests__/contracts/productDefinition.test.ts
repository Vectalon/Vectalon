import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createHash, generateKeyPairSync, sign } from 'node:crypto'
import { createRequire } from 'node:module'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'

import type { ProductDefinition } from '../../src/contracts/core.generated'

const bundledCoreRoot = path.resolve(__dirname, '../../dist/node_modules/@vectalon-dev/core')
const requireArtifact = createRequire(__filename)
const bundledCore = requireArtifact(path.join(bundledCoreRoot, 'index.js')) as typeof import('@vectalon-dev/core')
const { CONTRACT_REVISION, validateContract } = bundledCore
const coreDist = path.join(bundledCoreRoot, 'contracts')

describe('shipped ProductDefinition contract', () => {
  test('reads the supported Core fixture from the package artifact', () => {
    const payload: ProductDefinition = JSON.parse(
      readFileSync(path.join(coreDist, 'fixtures/ProductDefinition/valid.json'), 'utf8'),
    )

    expect(validateContract('ProductDefinition', payload)).toEqual({ valid: true, errors: [] })
    expect(CONTRACT_REVISION).toMatch(/^1\.0\.0\+[a-f0-9]{64}$/)
    expect(readFileSync(path.join(bundledCoreRoot, 'core-source-revision.txt'), 'utf8').trim()).toMatch(/^[a-f0-9]{40}$/)
    expect(JSON.parse(readFileSync(path.join(bundledCoreRoot, 'package.json'), 'utf8')).dependencies).toEqual({
      ajv: '^8.18.0',
    })
  })

  test('carries Core revision and public-key provenance in the packed artifact', () => {
    const provenance = JSON.parse(readFileSync(path.join(__dirname, '../../dist/license-provenance.json'), 'utf8')) as {
      coreSourceRevision: string
      keys: Array<{ id: string; algorithm: string; status: string; publicKeyFile: string; sha256: string }>
    }

    const reviewed = JSON.parse(readFileSync(path.resolve(__dirname, '../../../core/license-keyset.json'), 'utf8'))
    expect(provenance).toEqual(reviewed)
    expect(readFileSync(path.join(bundledCoreRoot, 'license-keyset.json'), 'utf8')).toBe(readFileSync(path.resolve(__dirname, '../../../core/license-keyset.json'), 'utf8'))
    for (const key of provenance.keys) {
      const publicKey = readFileSync(path.join(bundledCoreRoot, key.publicKeyFile), 'utf8')
      expect(createHash('sha256').update(publicKey).digest('hex')).toBe(key.sha256)
      expect(publicKey).not.toContain('PRIVATE KEY')
    }
  })

  test('fails closed for the future-major Core fixture', () => {
    const payload = JSON.parse(
      readFileSync(path.join(coreDist, 'fixtures/ProductDefinition/unknown-version.json'), 'utf8'),
    )

    expect(validateContract('ProductDefinition', payload).errors).toContainEqual({
      path: '/contractVersion',
      code: 'unsupported-version',
    })
  })

  test('packed CLI logout clears both current and recoverable lifecycle records', () => {
    const home = mkdtempSync(path.join(tmpdir(), 'vectalon-packed-home-'))
    const config = path.join(home, 'config')
    try {
      mkdirSync(config, { recursive: true })
      writeFileSync(path.join(config, 'license-v2.json'), JSON.stringify({ version: 1, revision: 2, token: 'redacted-current', lastTrustedTime: 1, lastOnlineAt: 1 }))
      writeFileSync(path.join(config, 'license-v2.json.previous'), JSON.stringify({ version: 1, revision: 1, token: 'redacted-previous', lastTrustedTime: 1, lastOnlineAt: 1 }))
      execFileSync(process.execPath, [path.resolve(__dirname, '../../bin/rn-vectalon.js'), 'auth', '--logout'], {
        env: { ...process.env, HOME: home, RN_VECTALON_CONFIG_DIR: config },
        stdio: 'pipe',
      })
      expect(existsSync(path.join(config, 'license-v2.json'))).toBe(false)
      expect(existsSync(path.join(config, 'license-v2.json.previous'))).toBe(false)
    } finally { rmSync(home, { recursive: true, force: true }) }
  })

  test('an isolated packed install grants a V2 paid gate through its one bundled Core runtime', () => {
    const consumer = mkdtempSync(path.join(tmpdir(), 'vectalon-clean-install-'))
    const pair = generateKeyPairSync('rsa', { modulusLength: 2048 })
    const now = 1_800_000_000_000
    const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')
    const key = { id: 'clean-install-key', algorithm: 'RS256' as const, status: 'active' as const, publicKey: pair.publicKey }
    const payload = {
      license_version: 2, jti: 'clean-install-license', iss: 'https://licenses.vectalon.dev', aud: 'vectalon-cli',
      sub: 'clean-install-customer', product: ['rn'], tier: 'team', seats: 2, state: 'active',
      iat: now / 1000, nbf: now / 1000, exp: (now + 30 * 86_400_000) / 1000,
    }
    const input = `${encode({ alg: 'RS256', kid: key.id, typ: 'vectalon-license+jwt' })}.${encode(payload)}`
    const credential = `${input}.${sign('RSA-SHA256', Buffer.from(input, 'ascii'), pair.privateKey).toString('base64url')}`
    let tarball: string | undefined
    try {
      writeFileSync(path.join(consumer, 'package.json'), JSON.stringify({ private: true, name: 'clean-vectalon-consumer' }))
      const npmEnvironment = { ...process.env, npm_config_cache: path.join(consumer, '.npm-cache') }
      const packed = JSON.parse(execFileSync('npm', ['pack', '--json', '--ignore-scripts'], { cwd: path.resolve(__dirname, '../..'), encoding: 'utf8', env: npmEnvironment })) as Array<{ filename: string }>
      tarball = path.resolve(__dirname, '../../', packed[0].filename)
      const packageRoot = path.join(consumer, 'node_modules', '@vectalon-dev', 'rn')
      mkdirSync(packageRoot, { recursive: true })
      execFileSync('tar', ['-xzf', tarball, '--strip-components=1', '-C', packageRoot])
      // This mirrors the production package's declared runtime dependency
      // closure while keeping the tested RN/Core modules outside this checkout.
      const workspaceModules = path.resolve(__dirname, '../../../../node_modules')
      for (const dependency of ['ajv', 'fast-deep-equal', 'fast-uri', 'json-schema-traverse', 'require-from-string']) {
        cpSync(path.join(workspaceModules, dependency), path.join(consumer, 'node_modules', dependency), { recursive: true })
      }

      const installed = createRequire(path.join(consumer, 'package.json'))
      const lifecycle = installed('@vectalon-dev/rn/dist/auth/licenseLifecycle.js') as typeof import('../../src/auth/licenseLifecycle')
      const store = new lifecycle.LicenseLifecycleStore({ directory: path.join(consumer, 'config'), legacyPaths: [] })
      const verify = lifecycle.createCustomerLicenseVerifier({ keys: [key], now: () => now })
      expect(store.save(credential, verify, now)).toEqual({ ok: true })
      expect(lifecycle.evaluateCustomerTier('pro', { store, verify, now: () => now })).toMatchObject({ allowed: true, currentTier: 'team' })
    } finally {
      if (tarball && existsSync(tarball)) rmSync(tarball, { force: true })
      rmSync(consumer, { recursive: true, force: true })
    }
  })
})
