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
const VENDOR_DIR = join(RN_ROOT, 'dist', 'node_modules', '@vectalon-dev', 'core')

if (!existsSync(join(CORE_ROOT, 'dist', 'index.js'))) {
  console.error('core/dist not found. Run pnpm turbo run build --filter=@vectalon-dev/core first.')
  process.exit(1)
}

// 1. Recreate the vendor directory so removed Core files cannot survive from
// a previous build and leak into a release artifact.
rmSync(VENDOR_DIR, { recursive: true, force: true })
mkdirSync(VENDOR_DIR, { recursive: true })

// 2. Copy core dist
cpSync(join(CORE_ROOT, 'dist'), VENDOR_DIR, { recursive: true, force: true })

// 3. Copy the permitted public key set. A package without a trust root is not
// releasable: it could not verify new lifecycle credentials fail-closed.
const publicKeyPath = join(CORE_ROOT, 'public-key.pem')
if (!existsSync(publicKeyPath)) throw new Error('Core public-key.pem is required for a license-capable RN artifact.')
cpSync(publicKeyPath, join(VENDOR_DIR, 'public-key.pem'), { force: true })

// Preserve the exact private-core commit used for this artifact. The release
// workflow writes this file immediately after checking out Vectalon/core main;
// local builds use the committed revision that produced packages/core/dist.
const revisionPath = join(CORE_ROOT, 'core-source-revision.txt')
if (!existsSync(revisionPath)) throw new Error('Core source revision is required for a release artifact.')
const coreSourceRevision = readFileSync(revisionPath, 'utf8').trim()
if (!/^[a-f0-9]{40}$/.test(coreSourceRevision)) throw new Error('Core source revision must be a full Git SHA.')
cpSync(revisionPath, join(VENDOR_DIR, 'core-source-revision.txt'), { force: true })

// Keep public-key IDs/status and the exact Core revision beside the packed
// runtime. This is public provenance, never signing material.
writeFileSync(join(RN_ROOT, 'dist', 'license-provenance.json'), JSON.stringify({
  schemaVersion: 1,
  coreSourceRevision,
  keys: [{
    id: 'vectalon-legacy',
    algorithm: 'RS256',
    status: 'active',
    sha256: createHash('sha256').update(readFileSync(publicKeyPath)).digest('hex'),
  }],
}, null, 2) + '\n')

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
