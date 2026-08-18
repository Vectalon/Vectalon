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

const { existsSync, mkdirSync, cpSync, readdirSync, readFileSync, writeFileSync } = require('fs')
const { join, dirname } = require('path')

const RN_ROOT = dirname(__dirname)
const CORE_ROOT = join(RN_ROOT, '..', 'core')
const VENDOR_DIR = join(RN_ROOT, 'dist', 'node_modules', '@vectalon-dev', 'core')

if (!existsSync(join(CORE_ROOT, 'dist', 'index.js'))) {
  console.error('core/dist not found. Run pnpm turbo run build --filter=@vectalon-dev/core first.')
  process.exit(1)
}

// 1. Create vendor directory
mkdirSync(VENDOR_DIR, { recursive: true })

// 2. Copy core dist
cpSync(join(CORE_ROOT, 'dist'), VENDOR_DIR, { recursive: true, force: true })

// 3. Copy public key (optional — may be in private repo only)
const publicKeyPath = join(CORE_ROOT, 'public-key.pem')
if (existsSync(publicKeyPath)) {
  cpSync(publicKeyPath, join(VENDOR_DIR, 'public-key.pem'), { force: true })
}

// Preserve the exact private-core commit used for this artifact. The release
// workflow writes this file immediately after checking out Vectalon/core main;
// local builds use the committed revision that produced packages/core/dist.
const revisionPath = join(CORE_ROOT, 'core-source-revision.txt')
if (existsSync(revisionPath)) {
  cpSync(revisionPath, join(VENDOR_DIR, 'core-source-revision.txt'), { force: true })
}

// 4. Create a synthetic package.json so Node resolution treats this as a package
writeFileSync(
  join(VENDOR_DIR, 'package.json'),
  JSON.stringify({
    name: '@vectalon-dev/core',
    version: '0.0.0-private',
    main: 'index.js',
    types: 'index.d.ts',
    private: true,
  }, null, 2)
)

console.log('Bundled @vectalon-dev/core into dist/node_modules/@vectalon-dev/core')
