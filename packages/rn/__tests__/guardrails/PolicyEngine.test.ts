import { mkdtempSync, readFileSync, rmSync, mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { PolicyEngine, initPolicy, defaultPolicy, defaultCodeReviewPolicy } from '../../src/guardrails/PolicyEngine'
import { writeOrgPolicyCache, type OrgPolicyDoc } from '../../src/knowledge/orgPolicy'

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

  it('runs policy checks through the composed Core harness', async () => {
    const engine = new PolicyEngine(tmpDir)
    const result = await engine.runPolicyWithHarness({
      filePath: 'src/api/client.ts',
      content: 'const BASE_URL = "https://api.example.com/v1";',
    })

    expect(result.ok).toBe(false)
    expect(result.harness.safe.status).toBe('blocked')
    expect(result.harness.safe.selectedRules.some(rule => rule.id === 'no-hardcoded-urls')).toBe(true)
    expect(JSON.stringify(result.harness.safe)).not.toContain(tmpDir)
    expect(JSON.stringify(result.harness.safe)).not.toContain('api.example.com')
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

  it('getCodeReviewPolicy returns defaults when no policy file exists', () => {
    const engine = new PolicyEngine(tmpDir)
    expect(engine.getCodeReviewPolicy()).toEqual(defaultCodeReviewPolicy)
  })

  it('getCodeReviewPolicy honors user overrides and clamps invalid values', () => {
    const engine = new PolicyEngine(tmpDir)
    engine.updatePolicy({
      version: 1,
      rules: {},
      customRules: [],
      codeReview: {
        maxAttempts: 5,
        healSeverity: 'warning',
        toolChecks: false,
      },
    })
    expect(engine.getCodeReviewPolicy()).toEqual({
      maxAttempts: 5,
      healSeverity: 'warning',
      toolChecks: false,
    })

    engine.updatePolicy({
      version: 1,
      rules: {},
      customRules: [],
      codeReview: { maxAttempts: 0, healSeverity: 'bogus' as never, toolChecks: 'no' as never },
    })
    expect(engine.getCodeReviewPolicy()).toEqual(defaultCodeReviewPolicy)
  })

  it('getCodeReviewPolicy falls back per-field when partially configured', () => {
    const engine = new PolicyEngine(tmpDir)
    engine.updatePolicy({
      version: 1,
      rules: {},
      customRules: [],
      codeReview: { healSeverity: 'info' },
    })
    const policy = engine.getCodeReviewPolicy()
    expect(policy.healSeverity).toBe('info')
    expect(policy.maxAttempts).toBe(defaultCodeReviewPolicy.maxAttempts)
    expect(policy.toolChecks).toBe(defaultCodeReviewPolicy.toolChecks)
  })
})

describe('PolicyEngine org policy layering (Team brain v2)', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'vectalon-orgpolicy-'))
    mkdirSync(join(tmpDir, '.vectalon', 'team'), { recursive: true })
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('enforces an org rule the moment the org policy is cached', () => {
    // The project disables console.log locally; the org policy adds an org
    // custom rule plus an override for a rule the project left untouched.
    writeFileSync(join(tmpDir, '.vectalon', 'policy.json'), JSON.stringify({
      version: 1,
      rules: { 'no-console-log': { enabled: false } },
      customRules: [],
    }))
    const orgDoc: OrgPolicyDoc = {
      version: 1,
      policy: {
        version: 1,
        rules: { 'no-hardcoded-urls': { enabled: false } },
        customRules: [{
          id: 'no-direct-navigation',
          name: 'No direct react-navigation imports',
          description: 'Use the project navigation wrapper instead.',
          severity: 'error',
          pattern: "import\\s+.*from\\s+['\"]@react-navigation/native['\"]",
        }],
      },
      budgets: {},
      updatedAt: '2026-08-13T00:00:00.000Z',
    }
    writeOrgPolicyCache(tmpDir, orgDoc)

    // A fresh engine (the production path) layers the org policy automatically.
    const engine = new PolicyEngine(tmpDir)
    const policy = engine.getPolicy()
    // The org override applies to the rule the local policy left alone.
    expect(policy.rules?.['no-hardcoded-urls']).toEqual({ enabled: false })
    // The local disable of console.log still wins (per-key, local wins).
    expect(policy.rules?.['no-console-log']).toEqual({ enabled: false })
    // And the org custom rule is enforced.
    const result = engine.runPolicy({
      filePath: 'src/screens/Home.tsx',
      content: "import { useNavigation } from '@react-navigation/native';",
    })
    expect(result.ok).toBe(false)
    expect(result.findings.some(f => f.rule === 'No direct react-navigation imports' && !f.passed)).toBe(true)
  })

  it('lets the local policy override an org rule decision', () => {
    writeOrgPolicyCache(tmpDir, {
      version: 1,
      policy: { version: 1, rules: { 'no-console-log': { severity: 'error' } }, customRules: [], codeReview: {} },
      budgets: {},
      updatedAt: '',
    })
    writeFileSync(join(tmpDir, '.vectalon', 'policy.json'), JSON.stringify({
      version: 1,
      rules: { 'no-console-log': { enabled: false } },
      customRules: [],
    }))

    const engine = new PolicyEngine(tmpDir)
    const result = engine.runPolicy({
      filePath: 'src/App.tsx',
      content: 'console.log("hello");',
    })
    // Local override wins — the org rule does not fire.
    expect(result.findings.some(f => f.rule === 'No console.log statements' && !f.passed)).toBe(false)
  })

  it('propagates org code-review tuning when the project is silent', () => {
    writeOrgPolicyCache(tmpDir, {
      version: 1,
      policy: { version: 1, rules: {}, customRules: [], codeReview: { healSeverity: 'warning' } },
      budgets: {},
      updatedAt: '',
    })
    const engine = new PolicyEngine(tmpDir)
    expect(engine.getCodeReviewPolicy().healSeverity).toBe('warning')
    expect(engine.getCodeReviewPolicy().maxAttempts).toBe(defaultCodeReviewPolicy.maxAttempts)
  })

  it('ignores a corrupt org cache', () => {
    writeFileSync(join(tmpDir, '.vectalon', 'team', 'org-policy.json'), 'not json{{')
    const engine = new PolicyEngine(tmpDir)
    expect(engine.getPolicy()).toEqual(defaultPolicy)
  })
})
