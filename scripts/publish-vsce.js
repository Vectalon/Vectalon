#!/usr/bin/env node
/**
 * Publish the VS Code extension to the Marketplace as part of a
 * semantic-release run. Invoked from `.releaserc.json` via the
 * `@semantic-release/exec` plugin:
 *
 *   "publishCmd": "node ./scripts/publish-vsce.js ${nextRelease.version}"
 *
 * Steps:
 *   1. Bump `extension/package.json` to the semantic-release version
 *   2. Compile the extension (`tsc -p extension`)
 *   3. `vsce package` a `.vsix`
 *   4. `vsce publish` it with the `VSCE_PAT` secret
 *
 * When `VSCE_PAT` is not configured, the `.vsix` is still built and the
 * publish is skipped with a warning — a release must never fail just because
 * marketplace credentials are missing.
 */
const { execSync } = require('child_process')
const { readFileSync, writeFileSync } = require('fs')
const { resolve, join } = require('path')
const { tmpdir } = require('os')

const root = resolve(__dirname, '..')
const extDir = join(root, 'extension')
const pkgPath = join(extDir, 'package.json')

const nextVersion = process.argv[2]
if (!nextVersion) {
  console.error('usage: node publish-vsce.js <semantic-release-version>')
  process.exit(1)
}
const version = nextVersion.replace(/^v/, '')

// The committed extension/package.json version stays at the baseline — the
// release version is derived here, in CI, from semantic-release. A local
// `vsce package` from a tag therefore builds with the committed (baseline)
// version; published .vsix files always carry the true release version.

// 1. Bump the extension version so the .vsix matches the npm release and
//    VS Code auto-update sees a strictly higher version next time.
const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
pkg.version = version
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n')

// 2. Compile.
console.log(`[vsce] compiling extension v${version}…`)
execSync('npx tsc -p ./', { cwd: extDir, stdio: 'inherit' })

// 3. Package to a temp location (never dirtied the working tree).
const vsixPath = join(tmpdir(), `vectalon-${version}.vsix`)
console.log(`[vsce] packaging ${vsixPath}…`)
execSync(`npx vsce package --out "${vsixPath}"`, { cwd: extDir, stdio: 'inherit' })

// 4. Publish (skip gracefully when the token is absent).
const pat = process.env.VSCE_PAT
if (!pat) {
  console.warn(`[vsce] VSCE_PAT not configured — published ${vsixPath} locally but skipped the Marketplace upload.`)
  process.exit(0)
}
console.log('[vsce] publishing to the VS Code Marketplace…')
execSync(`npx vsce publish --packagePath "${vsixPath}"`, {
  cwd: extDir,
  stdio: 'inherit',
  env: { ...process.env, VSCE_PAT: pat },
})
console.log(`[vsce] published vectalon ${version} to the VS Code Marketplace`)
