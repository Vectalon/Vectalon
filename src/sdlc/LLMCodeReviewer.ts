import pc from 'picocolors'
import type { ModelRouter } from '../model/ModelRouter'
import { reportError } from '../utils/safe'

export type ReviewSeverity = 'error' | 'warning' | 'info'

export interface LLMReviewFinding {
  severity: ReviewSeverity
  rule: string
  message: string
  line: number
  /** Optional concrete fix suggestion. */
  suggestion?: string
}

export interface LLMCodeReview {
  /** Overall verdict the LLM assigns to the code. */
  verdict: 'approved' | 'changes-requested'
  summary: string
  findings: LLMReviewFinding[]
  source: 'llm'
}

export interface LLMReviewOptions {
  code: string
  fileName: string
  /** Optional project context (conventions, existing components, feature prompt). */
  context?: string
  maxTokens?: number
  /** Detected lint/formatter configs or an explicit rules list to enforce. */
  rules?: string[]
}

const SEVERITIES = new Set<ReviewSeverity>(['error', 'warning', 'info'])
const VERDICTS = new Set<LLMCodeReview['verdict']>(['approved', 'changes-requested'])

/**
 * Parse the structured-output JSON the model returns for a code review.
 * Mirrors the zod-style validation used for intent detection: only enum
 * severities are accepted, invalid entries are dropped, and garbage payloads
 * return null so callers fall back to the rule-based analyzer.
 */
export function parseLLMReview(content: string): LLMCodeReview | null {
  const trimmed = content.trim()
  if (!trimmed) return null

  let jsonText = trimmed
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence) jsonText = fence[1].trim()

  let raw: unknown
  try {
    raw = JSON.parse(jsonText)
  } catch (err) {
    reportError(err, 'LLMCodeReviewer: parsing review JSON')
    return null
  }

  if (typeof raw !== 'object' || raw === null) return null
  const obj = raw as Record<string, unknown>
  if (typeof obj.verdict !== 'string' || !VERDICTS.has(obj.verdict as LLMCodeReview['verdict'])) return null
  if (!Array.isArray(obj.findings)) return null

  const findings: LLMReviewFinding[] = []
  for (const item of obj.findings) {
    if (typeof item !== 'object' || item === null) continue
    const entry = item as Record<string, unknown>
    if (typeof entry.severity !== 'string' || !SEVERITIES.has(entry.severity as ReviewSeverity)) continue
    if (typeof entry.rule !== 'string' || !entry.rule.trim()) continue
    if (typeof entry.message !== 'string' || !entry.message.trim()) continue
    const line = typeof entry.line === 'number' && Number.isFinite(entry.line) ? Math.max(1, Math.round(entry.line)) : 1
    const suggestion = typeof entry.suggestion === 'string' && entry.suggestion.trim() ? entry.suggestion.trim() : undefined
    findings.push({
      severity: entry.severity as ReviewSeverity,
      rule: entry.rule.trim(),
      message: entry.message.trim(),
      line,
      ...(suggestion ? { suggestion } : {}),
    })
  }

  return {
    verdict: obj.verdict as LLMCodeReview['verdict'],
    summary: typeof obj.summary === 'string' && obj.summary.trim() ? obj.summary.trim() : '',
    findings,
    source: 'llm',
  }
}

/** Build the nit-picking reviewer prompt: constrained schema + project context. */
export function buildLLMReviewPrompt(options: LLMReviewOptions): { systemPrompt: string; prompt: string } {
  const ruleLines: string[] = []
  if (options.rules && options.rules.length > 0) {
    ruleLines.push('The project enforces these rules — treat violations as findings at the severity shown:')
    ruleLines.push(...options.rules)
  } else {
    ruleLines.push(
      'Use comprehensive JS/TS/React Native best practices:',
      '- Security: no eval, no innerHTML, no hardcoded secrets, no http:// URLs.',
      '- TypeScript: no any, no non-null assertions (!), no @ts-ignore, explicit param types.',
      '- React Native: missing key in .map, direct state mutation, setState in render, missing useEffect cleanup, missing accessibility props.',
      '- Performance: avoid inline objects/arrays in useEffect deps, avoid inline styles.',
      '- Code quality: no var, use === / !==, no magic numbers, no unreachable code after return.',
      '- Error handling: no empty catch blocks, handle promises (await or .catch).',
      '- Modern JS: prefer optional chaining, avoid delete on object props.'
    )
  }

  const systemPrompt = [
    'You are a nit-picking senior React Native code reviewer. Your job is to catch real problems that a thorough human reviewer would flag before merge.',
    'Look for: correctness bugs, race conditions, error handling gaps, React Native anti-patterns, missing keys in lists, memory leaks in effects, style/accessibility issues, TypeScript type-safety problems, dead code, security issues, and broken edge cases.',
    ...ruleLines,
    'Be specific and actionable. Every finding needs a concrete rule id, a one-line message, and the 1-based line number it applies to.',
    'Only report findings you are confident about. If the code is genuinely clean, return verdict "approved" with an empty findings array.',
    'Return ONLY valid JSON matching this schema — no markdown, no commentary:',
    '{"verdict":"approved|changes-requested","summary":"one sentence overall assessment","findings":[{"severity":"error|warning|info","rule":"kebab-case-rule-id","message":"what is wrong and where","line":12,"suggestion":"how to fix it (optional)"}]}',
  ].join('\n')

  const prompt = [
    '# File under review',
    options.fileName,
    '',
    ...(options.context ? ['# Project context', options.context, ''] : []),
    '# Code',
    '```',
    options.code,
    '```',
  ].join('\n')

  return { systemPrompt, prompt }
}

/**
 * Review code with the LLM (structured output, temperature 0). Returns null on
 * any failure — no router, unavailable model, unparseable output, or thrown
 * error — so callers always have the rule-based analyzer as a safety net.
 */
export async function reviewCodeWithLLM(
  modelRouter: ModelRouter | undefined | null,
  options: LLMReviewOptions
): Promise<LLMCodeReview | null> {
  if (!modelRouter || typeof modelRouter.generate !== 'function') {
    return null
  }

  try {
    const { systemPrompt, prompt } = buildLLMReviewPrompt(options)
    const response = await modelRouter.generate({
      systemPrompt,
      prompt,
      maxTokens: options.maxTokens ?? 900,
      temperature: 0,
    })
    const content = response?.content || ''
    if (content.includes('[Local model fallback') || content.includes('no downloaded model')) {
      return null
    }
    return parseLLMReview(content)
  } catch (err) {
    reportError(err, 'LLMCodeReviewer: LLM review failed', 'warn')
    return null
  }
}

export interface FixCodeOptions {
  code: string
  fileName: string
  /** Findings to resolve; only these drive the fix prompt. */
  findings: LLMReviewFinding[]
  context?: string
  maxTokens?: number
}

/** Build the fix prompt: current file + findings, asking for the corrected file. */
export function buildFixPrompt(options: FixCodeOptions): { systemPrompt: string; prompt: string } {
  const systemPrompt = [
    'You are a senior React Native engineer fixing issues found in a code review.',
    'You will receive a file and a list of findings. Produce the COMPLETE corrected file content.',
    'Fix every finding. Keep everything else byte-identical: imports, formatting, naming, and unrelated code must not change.',
    'Return ONLY the corrected file content — no markdown fences, no commentary, no explanations. The output must be a drop-in replacement for the file.',
  ].join('\n')

  const findingsText = options.findings
    .map(f => `- [${f.severity}] ${f.rule} (line ${f.line}): ${f.message}${f.suggestion ? ` — suggestion: ${f.suggestion}` : ''}`)
    .join('\n')

  const prompt = [
    '# File to fix',
    options.fileName,
    '',
    ...(options.context ? ['# Project context', options.context, ''] : []),
    '# Findings to resolve',
    findingsText,
    '',
    '# Current file content',
    '```',
    options.code,
    '```',
  ].join('\n')

  return { systemPrompt, prompt }
}

/**
 * Extract the corrected file from the model response. The fix prompt asks for
 * a drop-in replacement; tolerate a surrounding code fence.
 */
export function extractFixedCode(content: string): string | null {
  const trimmed = content.trim()
  if (!trimmed) return null
  const fence = trimmed.match(/```(?:\w+)?\s*\n([\s\S]*?)```/)
  if (fence) {
    const inner = fence[1].replace(/\n$/, '')
    if (inner.trim()) return inner
  }
  return trimmed
}

/**
 * Feed findings + current file back to the model and return the corrected
 * content. Returns null on any failure — no router, fallback marker, or throw.
 */
export async function fixCodeWithLLM(
  modelRouter: ModelRouter | undefined | null,
  options: FixCodeOptions
): Promise<string | null> {
  if (!modelRouter || typeof modelRouter.generate !== 'function') {
    return null
  }
  try {
    const { systemPrompt, prompt } = buildFixPrompt(options)
    const response = await modelRouter.generate({
      systemPrompt,
      prompt,
      maxTokens: options.maxTokens ?? 2000,
      temperature: 0.1,
    })
    const content = response?.content || ''
    if (content.includes('[Local model fallback') || content.includes('no downloaded model')) {
      return null
    }
    return extractFixedCode(content)
  } catch (err) {
    reportError(err, 'LLMCodeReviewer: extracting fixed code', 'warn')
    return null
  }
}

/** Claude-style console rendering of an LLM code review. */
export function formatLLMReview(review: LLMCodeReview): string {
  const verdictIcon = review.verdict === 'approved' ? pc.green('✅') : pc.red('🚫')
  const lines = [
    `${verdictIcon} ${pc.bold(review.verdict === 'approved' ? 'Approved' : 'Changes requested')}${review.summary ? ` — ${pc.dim(review.summary)}` : ''}`,
  ]
  if (review.findings.length === 0) {
    lines.push(pc.dim('  No findings — clean code.'))
    return lines.join('\n')
  }
  for (const finding of review.findings) {
    const icon = finding.severity === 'error' ? pc.red('🔴') : finding.severity === 'warning' ? pc.yellow('🟡') : pc.blue('🔵')
    lines.push(`${icon} ${pc.bold(finding.rule)} ${pc.dim(`(line ${finding.line})`)} — ${finding.message}`)
    if (finding.suggestion) {
      lines.push(`  ${pc.dim('→')} ${finding.suggestion}`)
    }
  }
  return lines.join('\n')
}

