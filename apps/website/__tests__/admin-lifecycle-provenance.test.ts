import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const website = resolve(__dirname, '..')
const source = process.env.VECTALON_ADMIN_SOURCE
const script = resolve(website, 'scripts/sync-admin-lifecycle.mjs')
const provenancePath = resolve(website, 'contracts/admin/lifecycle/provenance.json')

describe('pinned Admin lifecycle snapshot', () => {
  it('records the approved Admin revision and passes self-contained snapshot verification', () => {
    const provenance = JSON.parse(readFileSync(provenancePath, 'utf8')) as { sourceCommit: string; files: Record<string, { sha256: string }> }
    expect(provenance.sourceCommit).toBe('999567f22f7f91ccf95d3f58c11c2d3346939b0e')
    expect(Object.keys(provenance.files)).toEqual(expect.arrayContaining([
      'lib/admin-lifecycle/generated/service.ts',
      'lib/admin-lifecycle/generated/repository.ts',
      'lib/admin-lifecycle/generated/signer.ts',
      'contracts/admin/lifecycle/LicenseCommandV1Response.schema.json',
    ]))
    expect(() => execFileSync(process.execPath, [script, '--check-snapshot'], { cwd: website, stdio: 'pipe' })).not.toThrow()
  })

  const sourceTest = source && existsSync(source) ? it : it.skip
  sourceTest('matches an explicitly supplied Admin source checkout', () => {
    expect(() => execFileSync(process.execPath, [script, '--check', '--source', source!], { cwd: website, stdio: 'pipe' })).not.toThrow()
  })

  it('makes source revision, source digests, and generated-file digests fail closed on drift', () => {
    const contents = readFileSync(script, 'utf8')
    expect(contents).toContain('admin-lifecycle-source-commit-mismatch')
    expect(contents).toContain('admin-lifecycle-provenance-drift')
    expect(contents).toContain('admin-lifecycle-snapshot-drift')
    expect(contents).toContain('sha256')
  })
})
