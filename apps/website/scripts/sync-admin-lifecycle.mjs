#!/usr/bin/env node
/**
 * Imports the reviewed, server-only portion of Admin's license lifecycle.
 *
 * This is deliberately a snapshot rather than a workspace dependency: the
 * website owns its deployment and must not acquire a second Admin endpoint.
 * `--check` is suitable for CI and rejects both a moved Admin checkout and a
 * modified generated file.
 */
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const website = resolve(here, '..')
const expectedCommit = '79bcfcad1ae323eab0669812d8186a140385e3a9'
const files = [
  ['lib/licenses/types.ts', 'lib/admin-lifecycle/generated/types.ts'],
  ['lib/licenses/lifecycle.ts', 'lib/admin-lifecycle/generated/lifecycle.ts'],
  ['lib/licenses/repository.ts', 'lib/admin-lifecycle/generated/repository.ts'],
  ['lib/licenses/signer.ts', 'lib/admin-lifecycle/generated/signer.ts'],
  ['lib/licenses/keys.ts', 'lib/admin-lifecycle/generated/keys.ts'],
  ['lib/licenses/postgres.ts', 'lib/admin-lifecycle/generated/postgres.ts'],
  ['lib/licenses/service.ts', 'lib/admin-lifecycle/generated/service.ts'],
  ['contracts/schemas/LicenseCommandV1Response.schema.json', 'contracts/admin/lifecycle/LicenseCommandV1Response.schema.json'],
]

function sha256(path) { return createHash('sha256').update(readFileSync(path)).digest('hex') }
function argument(name) {
  const at = process.argv.indexOf(name)
  return at >= 0 ? process.argv[at + 1] : undefined
}
function sourceRoot() {
  const source = argument('--source') ?? process.env.VECTALON_ADMIN_SOURCE
  if (!source) throw new Error('admin-lifecycle-source-required')
  return resolve(source)
}
function sourceCommit(source) {
  return execFileSync('git', ['-C', source, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
}
function manifest(source, commit) {
  return {
    adapterVersion: 1,
    source: 'vectalon-admin',
    sourceCommit: commit,
    files: Object.fromEntries(files.map(([from, to]) => [to, { source: from, sha256: sha256(resolve(source, from)) }])),
  }
}
function provenancePath() { return resolve(website, 'contracts/admin/lifecycle/provenance.json') }
function same(left, right) { return JSON.stringify(left) === JSON.stringify(right) }

export function verify(source) {
  const commit = sourceCommit(source)
  if (commit !== expectedCommit) throw new Error(`admin-lifecycle-source-commit-mismatch:${commit}`)
  const expected = manifest(source, commit)
  if (!existsSync(provenancePath()) || !same(JSON.parse(readFileSync(provenancePath(), 'utf8')), expected)) throw new Error('admin-lifecycle-provenance-drift')
  for (const [, target] of files) {
    const expectedDigest = expected.files[target].sha256
    const destination = resolve(website, target)
    if (!existsSync(destination) || sha256(destination) !== expectedDigest) throw new Error(`admin-lifecycle-snapshot-drift:${target}`)
  }
}

/** CI can verify the checked-in package without checking out the Admin repo. */
export function verifySnapshot() {
  if (!existsSync(provenancePath())) throw new Error('admin-lifecycle-provenance-drift')
  const provenance = JSON.parse(readFileSync(provenancePath(), 'utf8'))
  if (provenance.sourceCommit !== expectedCommit || !provenance.files || typeof provenance.files !== 'object') throw new Error('admin-lifecycle-provenance-drift')
  for (const [, target] of files) {
    const expectedDigest = provenance.files[target]?.sha256
    const destination = resolve(website, target)
    if (typeof expectedDigest !== 'string' || !existsSync(destination) || sha256(destination) !== expectedDigest) throw new Error(`admin-lifecycle-snapshot-drift:${target}`)
  }
}

export function sync(source) {
  const commit = sourceCommit(source)
  if (commit !== expectedCommit) throw new Error(`admin-lifecycle-source-commit-mismatch:${commit}`)
  const next = manifest(source, commit)
  for (const [from, target] of files) {
    const destination = resolve(website, target)
    mkdirSync(dirname(destination), { recursive: true })
    copyFileSync(resolve(source, from), destination)
  }
  writeFileSync(provenancePath(), `${JSON.stringify(next, null, 2)}\n`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--check-snapshot')) verifySnapshot()
  else {
    const source = sourceRoot()
    if (process.argv.includes('--check')) verify(source)
    else sync(source)
  }
}
