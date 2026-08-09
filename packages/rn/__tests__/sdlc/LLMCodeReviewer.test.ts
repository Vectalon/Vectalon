import {
  parseLLMReview,
  buildLLMReviewPrompt,
  reviewCodeWithLLM,
  formatLLMReview,
  fixCodeWithLLM,
  buildFixPrompt,
  extractFixedCode,
  verifyLLMReview,
  type LLMCodeReview,
} from '../../src/sdlc/LLMCodeReviewer'
import type { ModelRouter } from '../../src/model/ModelRouter'

function mockRouter(content: string): ModelRouter {
  return {
    generate: jest.fn(async () => ({ content, provider: 'test' })),
  } as unknown as ModelRouter
}

describe('parseLLMReview', () => {
  it('parses a valid review with findings', () => {
    const review = parseLLMReview(JSON.stringify({
      verdict: 'changes-requested',
      summary: 'Missing error handling',
      findings: [
        { severity: 'error', rule: 'missing-error-handling', message: 'No try/catch', line: 4, suggestion: 'Wrap in try/catch' },
        { severity: 'info', rule: 'nit', message: 'Trailing comma', line: 9 },
      ],
    }))
    expect(review).not.toBeNull()
    expect(review!.verdict).toBe('changes-requested')
    expect(review!.summary).toBe('Missing error handling')
    expect(review!.findings).toHaveLength(2)
    expect(review!.findings[0].severity).toBe('error')
    expect(review!.findings[0].suggestion).toBe('Wrap in try/catch')
    expect(review!.source).toBe('llm')
  })

  it('accepts fenced JSON', () => {
    const review = parseLLMReview('```json\n{"verdict":"approved","summary":"clean","findings":[]}\n```')
    expect(review).not.toBeNull()
    expect(review!.verdict).toBe('approved')
    expect(review!.findings).toEqual([])
  })

  it('drops invalid severity entries and clamps lines', () => {
    const review = parseLLMReview(JSON.stringify({
      verdict: 'changes-requested',
      summary: '',
      findings: [
        { severity: 'critical', rule: 'bad', message: 'dropped' },
        { severity: 'warning', rule: 'kept', message: 'kept', line: -3 },
      ],
    }))
    expect(review).not.toBeNull()
    expect(review!.findings).toHaveLength(1)
    expect(review!.findings[0].rule).toBe('kept')
    expect(review!.findings[0].line).toBe(1)
  })

  it('returns null for garbage, empty, and invalid verdicts', () => {
    expect(parseLLMReview('')).toBeNull()
    expect(parseLLMReview('not json')).toBeNull()
    expect(parseLLMReview('{"verdict":"maybe","findings":[]}')).toBeNull()
    expect(parseLLMReview('{"verdict":"approved"}')).toBeNull()
  })
})

describe('buildLLMReviewPrompt', () => {
  it('includes file name, code, and project context', () => {
    const { systemPrompt, prompt } = buildLLMReviewPrompt({
      code: 'export const a = 1',
      fileName: 'src/a.ts',
      context: 'TypeScript: yes',
    })
    expect(systemPrompt).toContain('nit-picking')
    expect(prompt).toContain('src/a.ts')
    expect(prompt).toContain('export const a = 1')
    expect(prompt).toContain('TypeScript: yes')
  })
})

describe('reviewCodeWithLLM', () => {
  it('returns null when no router or generate is missing', async () => {
    expect(await reviewCodeWithLLM(null, { code: 'x', fileName: 'a.ts' })).toBeNull()
    expect(await reviewCodeWithLLM({} as ModelRouter, { code: 'x', fileName: 'a.ts' })).toBeNull()
  })

  it('returns null for the local-model fallback marker', async () => {
    const router = mockRouter('[Local model fallback: no downloaded model or inference failed.]')
    expect(await reviewCodeWithLLM(router, { code: 'x', fileName: 'a.ts' })).toBeNull()
  })

  it('returns null on unparseable output and thrown errors', async () => {
    expect(await reviewCodeWithLLM(mockRouter('garbage'), { code: 'x', fileName: 'a.ts' })).toBeNull()
    const throwing = { generate: jest.fn(async () => { throw new Error('boom') }) } as unknown as ModelRouter
    expect(await reviewCodeWithLLM(throwing, { code: 'x', fileName: 'a.ts' })).toBeNull()
  })

  it('returns the parsed review on valid output', async () => {
    const review = await reviewCodeWithLLM(mockRouter(JSON.stringify({
      verdict: 'approved',
      summary: 'Clean',
      findings: [],
    })), { code: 'x', fileName: 'a.ts' })
    expect(review).not.toBeNull()
    expect(review!.verdict).toBe('approved')
  })

  it('drops LLM findings whose rule signal is absent from the code (hallucination guard)', async () => {
    // The model claims a .map() key issue and an http URL — the code has neither.
    const review = await reviewCodeWithLLM(mockRouter(JSON.stringify({
      verdict: 'changes-requested',
      summary: 'Several issues',
      findings: [
        { severity: 'error', rule: 'missing-key-prop', message: 'no key', line: 12 },
        { severity: 'error', rule: 'no-http-url', message: 'http url', line: 14 },
        { severity: 'warning', rule: 'no-any', message: 'any type', line: 3 },
      ],
    })), { code: 'export const a = 1', fileName: 'a.ts' })
    expect(review).not.toBeNull()
    expect(review!.findings).toHaveLength(0)
    expect(review!.verdict).toBe('approved')
  })

  it('keeps LLM findings whose signal is genuinely present', async () => {
    const review = await reviewCodeWithLLM(mockRouter(JSON.stringify({
      verdict: 'changes-requested',
      summary: 'Real problems',
      findings: [
        { severity: 'error', rule: 'no-http-url', message: 'http url', line: 2 },
        { severity: 'warning', rule: 'no-any', message: 'any type', line: 4 },
      ],
    })), {
      code: 'const url = "http://api.example.com";\nexport const x: any = 1',
      fileName: 'a.ts',
    })
    expect(review).not.toBeNull()
    expect(review!.findings.map(f => f.rule)).toEqual(['no-http-url', 'no-any'])
    expect(review!.verdict).toBe('changes-requested')
  })

  it('keeps findings for rules without a verifiable signal (conservative)', async () => {
    const review = await reviewCodeWithLLM(mockRouter(JSON.stringify({
      verdict: 'changes-requested',
      summary: 'Refactor',
      findings: [
        { severity: 'warning', rule: 'magic-number', message: 'extract const', line: 3 },
      ],
    })), { code: 'const w = 320', fileName: 'a.ts' })
    expect(review).not.toBeNull()
    expect(review!.findings).toHaveLength(1)
    expect(review!.verdict).toBe('changes-requested')
  })
})

describe('verifyLLMReview', () => {
  it('flips to approved when every finding was hallucinated', () => {
    const review: LLMCodeReview = {
      verdict: 'changes-requested',
      summary: 'issues',
      findings: [{ severity: 'error', rule: 'missing-key-prop', message: 'no key', line: 12 }],
      source: 'llm',
    }
    const verified = verifyLLMReview(review, 'export const a = 1')
    expect(verified.verdict).toBe('approved')
    expect(verified.findings).toEqual([])
    expect(verified.summary).toContain('cleared by code verification')
  })

  it('keeps supported findings unchanged when the signal is present', () => {
    const review: LLMCodeReview = {
      verdict: 'changes-requested',
      summary: 'issues',
      findings: [{ severity: 'error', rule: 'no-ts-ignore', message: 'no ts-ignore', line: 1 }],
      source: 'llm',
    }
    const verified = verifyLLMReview(review, '// @ts-ignore\nexport const a = 1')
    expect(verified.findings).toHaveLength(1)
    expect(verified.verdict).toBe('changes-requested')
  })
})

describe('extractFixedCode', () => {
  it('extracts fenced file content', () => {
    const code = '```tsx\nexport const a = 1\n```'
    expect(extractFixedCode(code)).toBe('export const a = 1')
  })

  it('returns raw content when not fenced', () => {
    expect(extractFixedCode('export const a = 1')).toBe('export const a = 1')
  })

  it('returns null for empty output', () => {
    expect(extractFixedCode('')).toBeNull()
    expect(extractFixedCode('   ')).toBeNull()
  })
})

describe('buildFixPrompt', () => {
  it('includes the file, findings, and current code', () => {
    const { systemPrompt, prompt } = buildFixPrompt({
      code: 'export const a = 1',
      fileName: 'src/a.ts',
      findings: [{ severity: 'error', rule: 'no-any', message: 'Avoid any', line: 3 }],
      context: 'TypeScript: yes',
    })
    expect(systemPrompt).toContain('corrected file content')
    expect(prompt).toContain('src/a.ts')
    expect(prompt).toContain('no-any')
    expect(prompt).toContain('export const a = 1')
    expect(prompt).toContain('TypeScript: yes')
  })
})

describe('fixCodeWithLLM', () => {
  const findings = [{ severity: 'error' as const, rule: 'no-any', message: 'Avoid any', line: 3 }]

  it('returns the corrected content on valid output', async () => {
    const router = mockRouter('```ts\nexport const a: number = 1\n```')
    const fixed = await fixCodeWithLLM(router, { code: 'const a: any = 1', fileName: 'a.ts', findings })
    expect(fixed).toBe('export const a: number = 1')
  })

  it('returns null when no router is available', async () => {
    expect(await fixCodeWithLLM(null, { code: 'x', fileName: 'a.ts', findings })).toBeNull()
    expect(await fixCodeWithLLM({} as ModelRouter, { code: 'x', fileName: 'a.ts', findings })).toBeNull()
  })

  it('returns null for the fallback marker and thrown errors', async () => {
    expect(await fixCodeWithLLM(mockRouter('[Local model fallback: no downloaded model]'), { code: 'x', fileName: 'a.ts', findings })).toBeNull()
    const throwing = { generate: jest.fn(async () => { throw new Error('boom') }) } as unknown as ModelRouter
    expect(await fixCodeWithLLM(throwing, { code: 'x', fileName: 'a.ts', findings })).toBeNull()
  })
})

describe('formatLLMReview', () => {
  it('renders approved and findings with severity colors', () => {
    const review: LLMCodeReview = {
      verdict: 'changes-requested',
      summary: 'Fix the leak',
      findings: [{ severity: 'error', rule: 'effect-leak', message: 'Missing cleanup', line: 12, suggestion: 'Return cleanup fn' }],
      source: 'llm',
    }
    const out = formatLLMReview(review)
    expect(out).toContain('Changes requested')
    expect(out).toContain('effect-leak')
    expect(out).toContain('line 12')
    expect(out).toContain('Return cleanup fn')
  })

  it('renders clean approval', () => {
    const out = formatLLMReview({ verdict: 'approved', summary: 'No issues', findings: [], source: 'llm' })
    expect(out).toContain('Approved')
    expect(out).toContain('No findings')
  })
})
