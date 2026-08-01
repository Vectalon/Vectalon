import { mkdtempSync, readFileSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { PolicyEngine, initPolicy, defaultPolicy } from '../../src/guardrails/PolicyEngine'

describe('PolicyEngine', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'vectalon-policy-'))
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('uses base rules when no policy file exists', () => {
    const engine = new PolicyEngine(tmpDir)
    const result = engine.runPolicy({
      filePath: 'src/api/client.ts',
      content: 'const BASE_URL = "https://api.example.com/v1";',
    })

    expect(result.ok).toBe(false)
    expect(result.findings.some(f => f.rule === 'No hardcoded API URLs' && !f.passed)).toBe(true)
  })

  it('loads and applies project-specific overrides', () => {
    const engine = new PolicyEngine(tmpDir)
    engine.updatePolicy({
      version: 1,
      rules: {
        'no-hardcoded-urls': { enabled: false },
      },
      customRules: [],
    })

    const result = engine.runPolicy({
      filePath: 'src/api/client.ts',
      content: 'const BASE_URL = "https://api.example.com/v1";',
    })

    expect(result.findings.some(f => f.rule === 'No hardcoded API URLs' && !f.passed)).toBe(false)
  })

  it('applies custom regex rules', () => {
    const engine = new PolicyEngine(tmpDir)
    engine.updatePolicy({
      version: 1,
      rules: {},
      customRules: [
        {
          id: 'no-react-navigation-direct',
          name: 'No direct react-navigation imports',
          description: 'Use the project navigation wrapper instead.',
          severity: 'error',
          pattern: "import\\s+.*from\\s+['\"]@react-navigation/native['\"]",
          message: 'Import navigation from @app/navigation instead',
        },
      ],
    })

    const result = engine.runPolicy({
      filePath: 'src/screens/Home.tsx',
      content: "import { useNavigation } from '@react-navigation/native';",
    })

    expect(result.ok).toBe(false)
    expect(result.findings.some(f => f.rule === 'No direct react-navigation imports' && !f.passed)).toBe(true)
  })

  it('initPolicy creates a default policy file', () => {
    const path = initPolicy(tmpDir)
    expect(path).toBe(join(tmpDir, '.vectalon', 'policy.json'))
    const written = JSON.parse(readFileSync(path, 'utf-8'))
    expect(written.version).toBe(defaultPolicy.version)
    expect(written.customRules).toEqual([])
  })

  it('updatePolicy persists changes', () => {
    const engine = new PolicyEngine(tmpDir)
    const updated = {
      version: 1,
      rules: { 'no-any-type': { severity: 'error' as const } },
      customRules: [],
    }
    engine.updatePolicy(updated)
    expect(engine.getPolicy()).toEqual(updated)
  })

  it('allows changing base rule severity', () => {
    const engine = new PolicyEngine(tmpDir)
    engine.updatePolicy({
      version: 1,
      rules: {
        'no-any-type': { severity: 'error' },
      },
      customRules: [],
    })

    const result = engine.runPolicy({
      filePath: 'src/types.ts',
      content: 'export function log(value: any) { return value; }',
    })

    const finding = result.findings.find(f => f.rule === 'No explicit any types')
    expect(finding?.severity).toBe('error')
    expect(finding?.passed).toBe(false)
  })
})
