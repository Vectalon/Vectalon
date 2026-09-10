import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const website = resolve(__dirname, '..')

describe('Admin lifecycle server boundary', () => {
  it('keeps the runtime adapter server-only and avoids an operator-secret client or Admin egress', () => {
    const adapter = readFileSync(resolve(website, 'lib/admin-lifecycle/in-process-adapter.ts'), 'utf8')
    const gateway = readFileSync(resolve(website, 'lib/lifecycle-gateway.ts'), 'utf8')
    expect(adapter).toContain("import 'server-only'")
    expect(adapter).toContain('process.env.VECTALON_LICENSE_DATABASE_URL ?? process.env.DATABASE_URL')
    expect(adapter).toContain('rejectUnauthorized: true')
    expect(adapter).not.toContain('VECTALON_LICENSE_OPERATOR_SECRET')
    expect(adapter).not.toContain('fetch(')
    expect(gateway).not.toContain('defaultAdminStore')
    expect(gateway).not.toContain('fetch(')
  })

  it('does not serialize a signing private key from the reviewed signer implementation', () => {
    const signer = readFileSync(resolve(website, 'lib/admin-lifecycle/generated/signer.ts'), 'utf8')
    expect(signer).toContain('#privateKeyPem')
    expect(signer).not.toContain('private privateKeyPem')
  })
})
