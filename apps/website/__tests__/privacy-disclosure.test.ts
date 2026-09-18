import { readFileSync } from 'node:fs'
import path from 'node:path'

describe('served privacy disclosures', () => {
  it('distinguishes bounded optional usage from raw diagnostics and explicit uploads', () => {
    const page = readFileSync(path.join(__dirname, '../public/legal/privacy.html'), 'utf8')
    expect(page).toContain('Effective 18 September 2026')
    expect(page).toContain('Configured remote model providers receive the context you choose to send')
    expect(page).toContain('Optional Core usage telemetry sends only five bounded numeric ingestion counts')
    expect(page).toContain('no machine fingerprint')
    expect(page).toContain('RN error reports and heartbeats require separate opt-in')
    expect(page).toContain('raw messages, stacks, and identifiers')
    expect(page).toContain('Only package.json is sanitized')
    expect(page).toContain('Inspect support bundles before uploading')
    expect(page).not.toContain('We do not upload or store your source code through ordinary product use')
    expect(page).not.toContain('designed to redact common secrets')
  })
})
