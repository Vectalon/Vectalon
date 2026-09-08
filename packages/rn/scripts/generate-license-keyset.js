#!/usr/bin/env node
/* Generate the non-secret keyset manifest from the reviewed Core checkout. */
const { existsSync, readFileSync, writeFileSync } = require('fs')
const { basename, join } = require('path')
const { createHash } = require('crypto')

const [, , coreRoot, revision, output] = process.argv
if (!coreRoot || !revision || !output) throw new Error('usage: generate-license-keyset.js <core-root> <core-sha> <output>')
if (!/^[a-f0-9]{40}$/.test(revision)) throw new Error('Core source revision must be a full Git SHA.')
const source = join(coreRoot, 'license-keyset.json')
const keyset = existsSync(source)
  ? JSON.parse(readFileSync(source, 'utf8'))
  : { schemaVersion: 1, keys: [{ id: 'vectalon-legacy', algorithm: 'RS256', status: 'active', publicKeyFile: 'public-key.pem' }] }
if (keyset.schemaVersion !== 1 || !Array.isArray(keyset.keys) || keyset.keys.length === 0) throw new Error('Reviewed Core keyset manifest is invalid.')
const keys = keyset.keys.map((key) => {
  if (!key || typeof key.id !== 'string' || key.algorithm !== 'RS256' || !['active', 'retired', 'compromised'].includes(key.status)) throw new Error('Reviewed Core key metadata is invalid.')
  const publicKeyFile = typeof key.publicKeyFile === 'string' ? basename(key.publicKeyFile) : ''
  if (!publicKeyFile || publicKeyFile !== key.publicKeyFile) throw new Error('Reviewed Core key path is invalid.')
  const bytes = readFileSync(join(coreRoot, publicKeyFile))
  if (/PRIVATE KEY/.test(bytes.toString('utf8'))) throw new Error('A private key must never be packed.')
  return { id: key.id, algorithm: key.algorithm, status: key.status, publicKeyFile, sha256: createHash('sha256').update(bytes).digest('hex') }
})
writeFileSync(output, JSON.stringify({ schemaVersion: 1, coreSourceRevision: revision, keys }, null, 2) + '\n')
