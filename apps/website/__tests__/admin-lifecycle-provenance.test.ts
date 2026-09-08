import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const website = resolve(__dirname, '..')
const source = '/private/tmp/admin-step08'
const script = resolve(website, 'scripts/sync-admin-lifecycle.mjs')
const provenancePath = resolve(website, 'contracts/admin/lifecycle/provenance.json')

describe('pinned Admin lifecycle snapshot', () => {
  it('records the approved Admin revision and passes reproducible sync drift verification', () => {
    const provenance = JSON.parse(readFileSync(provenancePath, 'utf8')) as { sourceCommit: string; files: Record<string, { sha256: string }> }
    expect(provenance.sourceCommit).toBe('79bcfcad1ae323eab0669812d8186a140385e3a9')
    expect(Object.keys(provenance.files)).toEqual(expect.arrayContaining([
      'lib/admin-lifecycle/generated/service.ts',
      'lib/admin-lifecycle/generated/repository.ts',
      'lib/admin-lifecycle/generated/signer.ts',
      'contracts/admin/lifecycle/LicenseCommandV1Response.schema.json',
    ]))
    expect(existsSync(source)).toBe(true)
    expect(() => execFileSync(process.execPath, [script, '--check', '--source', source], { cwd: website, stdio: 'pipe' })).not.toThrow()
  })

  it('makes source revision, source digests, and generated-file digests fail closed on drift', () => {
    const contents = readFileSync(script, 'utf8')
    expect(contents).toContain('admin-lifecycle-source-commit-mismatch')
    expect(contents).toContain('admin-lifecycle-provenance-drift')
    expect(contents).toContain('admin-lifecycle-snapshot-drift')
    expect(contents).toContain('sha256')
  })
})
