#!/usr/bin/env node
/**
 * bundle-core.js — Inline @vectalon-dev/core into the rn publish build
 *
 * Copies core/dist and core/public-key.pem into rn/dist/node_modules/@vectalon-dev/core
 * so that require("@vectalon-dev/core") resolves at runtime without core being a
 * separate npm dependency.
 *
 * This keeps the licensing/trial/telemetry source out of the public npm registry
 * as a standalone package.
 */

const { existsSync, mkdirSync, cpSync, readFileSync, rmSync, writeFileSync } = require('fs')
const { join, dirname } = require('path')
const { createHash } = require('crypto')

const RN_ROOT = dirname(__dirname)
const CORE_ROOT = join(RN_ROOT, '..', 'core')
const REVIEWED_CORE_ROOT = process.env.CORE_REPO_DIR || CORE_ROOT
const VENDOR_DIR = join(RN_ROOT, 'dist', 'node_modules', '@vectalon-dev', 'core')

if (!existsSync(join(REVIEWED_CORE_ROOT, 'dist', 'index.js'))) {
  console.error('core/dist not found. Run pnpm turbo run build --filter=@vectalon-dev/core first.')
  process.exit(1)
}

// 1. Recreate the vendor directory so removed Core files cannot survive from
// a previous build and leak into a release artifact.
rmSync(VENDOR_DIR, { recursive: true, force: true })
mkdirSync(VENDOR_DIR, { recursive: true })

// 2. Copy core dist
cpSync(join(REVIEWED_CORE_ROOT, 'dist'), VENDOR_DIR, { recursive: true, force: true })

// 3. Copy the permitted public key set. A package without a trust root is not
// releasable: it could not verify new lifecycle credentials fail-closed.
const keysetPath = join(REVIEWED_CORE_ROOT, 'license-keyset.json')
if (!existsSync(keysetPath)) throw new Error('Reviewed Core license-keyset.json is required for a license-capable RN artifact.')
const keyset = JSON.parse(readFileSync(keysetPath, 'utf8'))
if (keyset.schemaVersion !== 1 || !Array.isArray(keyset.keys) || keyset.keys.length === 0) throw new Error('Reviewed Core keyset manifest is invalid.')
for (const key of keyset.keys) {
  if (!key || typeof key.id !== 'string' || key.algorithm !== 'RS256' || !['active', 'retired', 'compromised'].includes(key.status) || typeof key.publicKeyFile !== 'string' || key.publicKeyFile.includes('/') || !/^[a-f0-9]{64}$/.test(key.sha256 || '')) throw new Error('Reviewed Core key metadata is invalid.')
  const publicKeyPath = join(REVIEWED_CORE_ROOT, key.publicKeyFile)
  const publicKey = readFileSync(publicKeyPath)
  if (createHash('sha256').update(publicKey).digest('hex') !== key.sha256 || /PRIVATE KEY/.test(publicKey.toString('utf8'))) throw new Error(`Reviewed Core key ${key.id} failed provenance validation.`)
  cpSync(publicKeyPath, join(VENDOR_DIR, key.publicKeyFile), { force: true })
}
cpSync(keysetPath, join(VENDOR_DIR, 'license-keyset.json'), { force: true })

// Preserve the exact private-core commit used for this artifact. The release
// workflow writes this file immediately after checking out Vectalon/core main;
// local builds use the committed revision that produced packages/core/dist.
const revisionPath = join(CORE_ROOT, 'core-source-revision.txt')
if (!existsSync(revisionPath)) throw new Error('Core source revision is required for a release artifact.')
const coreSourceRevision = readFileSync(revisionPath, 'utf8').trim()
if (!/^[a-f0-9]{40}$/.test(coreSourceRevision)) throw new Error('Core source revision must be a full Git SHA.')
cpSync(revisionPath, join(VENDOR_DIR, 'core-source-revision.txt'), { force: true })

// The packed public manifest is copied from the reviewed Core input. It can
// represent overlapping, retired, and compromised verification keys.
if (keyset.coreSourceRevision !== coreSourceRevision) throw new Error('Reviewed Core keyset revision does not match the frozen Core revision.')
writeFileSync(join(RN_ROOT, 'dist', 'license-provenance.json'), JSON.stringify(keyset, null, 2) + '\n')

// 4. Create a synthetic package.json so Node resolution treats this as a package
writeFileSync(
  join(VENDOR_DIR, 'package.json'),
  JSON.stringify({
    name: '@vectalon-dev/core',
    version: '0.0.0-private',
    main: 'index.js',
    types: 'index.d.ts',
    private: true,
    dependencies: {
      ajv: '^8.18.0',
    },
  }, null, 2)
)

console.log('Bundled @vectalon-dev/core into dist/node_modules/@vectalon-dev/core')
