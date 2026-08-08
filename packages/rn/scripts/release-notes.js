#!/usr/bin/env node
/**
 * Generate the GitHub Release body for @vectalon-dev/rn from the CHANGELOG,
 * so releases ship with real "what's new" notes instead of a bare template.
 *
 * Invoked from `.github/workflows/publish.yml` (tag-release job):
 *
 *   node packages/rn/scripts/release-notes.js <rn-version> [core-version]
 *
 * Behavior:
 *   1. Reads packages/rn/CHANGELOG.md and finds the section whose header
 *      matches `## [<rn-version>]` (exact version, so 0.1.1 never matches
 *      0.1.15) up to the next `## [` header.
 *   2. Prints a complete markdown release body to stdout: the rn/core header,
 *      the changelog section, and install instructions.
 *   3. When no CHANGELOG entry exists for the version (or the file is
 *      missing), prints a minimal body pointing at the CHANGELOG — the
 *      release is never blocked by missing notes.
 */
const { readFileSync } = require('fs')
const { join, resolve } = require('path')

const root = resolve(__dirname, '..')
const changelogPath = join(root, 'CHANGELOG.md')

const rnVersion = (process.argv[2] || '').replace(/^v/, '')
const coreVersion = (process.argv[3] || '').replace(/^v/, '') || '0.1.0'

if (!rnVersion) {
  console.error('usage: node release-notes.js <rn-version> [core-version]')
  process.exit(1)
}

/** Pull the `## [<version>]` section body from the changelog, or ''. */
function changelogSection(version) {
  let changelog
  try {
    changelog = readFileSync(changelogPath, 'utf8')
  } catch (err) {
    // Only a missing changelog is tolerable; anything else should fail loudly
    // so a release never ships notes-less because of a masked read error.
    if (err.code !== 'ENOENT') throw err
    return ''
  }
  // Match the full `## [version] - date` header line so the date stays with
  // the header, not the section body. `^` with the m flag anchors each line.
  const headers = [...changelog.matchAll(/^## \[([^\]]+)\][^\n]*/gm)]
  const idx = headers.findIndex(h => h[1] === version)
  if (idx === -1) return ''
  const start = headers[idx].index + headers[idx][0].length
  const end = idx + 1 < headers.length ? headers[idx + 1].index : changelog.length
  return changelog.slice(start, end).trim()
}

const section = changelogSection(rnVersion)
const lines = [
  `## @vectalon-dev/rn — ${rnVersion}`,
  '',
  `Core version (bundled): ${coreVersion}`,
  '',
]

if (section) {
  lines.push(section, '')
} else {
  console.error(`[release-notes] no CHANGELOG entry for ${rnVersion} — emitting minimal body`)
  lines.push(
    'See the [CHANGELOG](https://github.com/Vectalon/Vectalon/blob/main/packages/rn/CHANGELOG.md) for this release.',
    ''
  )
}

lines.push(
  '---',
  '',
  '### Install',
  '',
  '```bash',
  `npm install @vectalon-dev/rn@${rnVersion}`,
  '```',
  ''
)

process.stdout.write(lines.join('\n'))
