export interface ReviewFinding {
  severity: 'error' | 'warning' | 'info'
  rule: string
  message: string
  line: number
}

/**
 * A runtime metric (from Hermes profiling) that a review can cite as evidence.
 * When a metric's function name appears in the reviewed code, the review emits
 * a finding with concrete numbers — e.g. "useEffect blocks the JS thread for
 * 500ms — move to a worklet".
 */
export interface PerfRuntimeMetric {
  /** Function or component the metric is about, e.g. `useEffect`, `onPress`. */
  function: string
  metric: 'blocking' | 'retained-size' | 'leak' | 'regression'
  /** Millisecond value for blocking metrics. */
  valueMs?: number
  /** Byte value for retention/leak metrics. */
  valueBytes?: number
  /** Optional source file the metric belongs to. */
  file?: string
  detail?: string
}

/** Turn a runtime metric into a human message (shared with the perf module). */
export function formatRuntimeMetricMessage(m: PerfRuntimeMetric): string {
  if (m.metric === 'blocking' && m.valueMs !== undefined) {
    return `${m.function} blocks the JS thread for ${m.valueMs}ms — move to a worklet or defer off the JS thread.`
  }
  if (m.metric === 'retained-size' && m.valueBytes !== undefined) {
    return `${m.function} retains ${formatRuntimeBytes(m.valueBytes)} on the heap — release references on unmount.`
  }
  if (m.metric === 'leak' && m.valueBytes !== undefined) {
    return `${m.function} holds ${formatRuntimeBytes(m.valueBytes)} of allocation — possible leak if it accumulates across screens.`
  }
  if (m.metric === 'regression') {
    return `${m.function} regressed vs the performance baseline${m.detail ? `: ${m.detail}` : ''}.`
  }
  return m.detail || `${m.function} has a runtime performance issue.`
}

function formatRuntimeBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${bytes} B`
}

/** Comprehensive rule definitions for JS/TS/React Native code review. */
export interface RuleDef {
  id: string
  severity: ReviewFinding['severity']
  message: string
  test: (line: string, lines: string[], index: number) => boolean
}

const RULES: RuleDef[] = [
  // Security
  {
    id: 'no-eval',
    severity: 'error',
    message: 'Avoid eval() and new Function() — severe security risk.',
    test: (line) => /\beval\s*\(|new\s+Function\s*\(/.test(line),
  },
  {
    id: 'no-inner-html',
    severity: 'error',
    message: 'Avoid innerHTML and dangerouslySetInnerHTML — XSS risk.',
    test: (line) => /\.innerHTML\s*=|dangerouslySetInnerHTML/.test(line),
  },
  {
    id: 'no-hardcoded-secrets',
    severity: 'error',
    message: 'Remove hardcoded API keys, tokens, or passwords.',
    test: (line) =>
      /\b(api[_-]?key|apikey|secret|password|token)\s*[:=]\s*['"][a-zA-Z0-9_-]{16,}['"]/i.test(line),
  },
  {
    id: 'no-http-url',
    severity: 'warning',
    message: 'Use https:// instead of http:// for network requests.',
    test: (line) => /['"]http:\/\/[^'"]+['"]/.test(line),
  },

  // TypeScript
  {
    id: 'no-any',
    severity: 'warning',
    message: 'Avoid the any type; use a concrete type or unknown.',
    test: (line) => /:\s*any\b|as\s+any\b|<any>/.test(line),
  },
  {
    id: 'no-non-null-assertion',
    severity: 'warning',
    message: 'Avoid non-null assertions (!); add null checks instead.',
    test: (line) => /![.?)]/.test(line),
  },
  {
    id: 'no-ts-ignore',
    severity: 'warning',
    message: 'Replace @ts-ignore with a typed fix or @ts-expect-error with justification.',
    test: (line) => /@ts-ignore/.test(line),
  },
  {
    id: 'no-implicit-any-param',
    severity: 'warning',
    message: 'Add explicit types to function parameters.',
    test: (line) => /\bfunction\s+\w+\s*\(\s*\w+\s*[,)]/.test(line) && !line.includes(':'),
  },

  // React / React Native
  {
    id: 'no-console-log',
    severity: 'warning',
    message: 'Remove console.log / console.debug before merging.',
    test: (line) => /console\.(log|debug|warn)\s*\(/.test(line),
  },
  {
    id: 'missing-key-prop',
    severity: 'error',
    message: 'Array .map() must include a unique key prop for each element.',
    test: (line) => /\.map\s*\(/.test(line) && !line.includes('key=') && !line.includes('key :'),
  },
  {
    id: 'inline-style',
    severity: 'info',
    message: 'Prefer StyleSheet.create over inline style={{...}} for performance.',
    test: (line) => /style=\{\{/.test(line),
  },
  {
    id: 'direct-state-mutation',
    severity: 'error',
    message: 'Never mutate state directly; always use the setter function.',
    test: (line) => /\bstate\.[a-zA-Z0-9_$]+\s*=/.test(line),
  },
  {
    id: 'set-state-in-render',
    severity: 'error',
    message: 'Do not call setState during the render phase (use useEffect).',
    test: (line) => /\bset[A-Z]\w*\s*\([^)]*\)/.test(line) && /return\s+\(/.test(line),
  },
  {
    id: 'missing-use-effect-cleanup',
    severity: 'warning',
    message: 'useEffect subscriptions, timers, or listeners should return a cleanup function.',
    test: (line, lines, i) => {
      if (!/\buseEffect\s*\(/.test(line)) return false
      // Scan next 15 lines for a return statement inside the effect
      for (let j = i + 1; j < Math.min(lines.length, i + 15); j++) {
        const l = lines[j].trim()
        if (l.startsWith('return') && l.includes('()')) return true
        if (l.startsWith('},') || l.startsWith('})')) break
      }
      return false
    },
  },
  {
    id: 'use-effect-missing-deps',
    severity: 'warning',
    message: 'useEffect dependency array may be missing values used inside.',
    test: (line) => /useEffect\s*\([^,]+,\s*\[\s*\]\s*\)/.test(line),
  },
  {
    id: 'missing-accessibility',
    severity: 'warning',
    message: 'Interactive elements should have accessibilityLabel and accessibilityRole.',
    test: (line) =>
      /onPress\s*=|onPress=/.test(line) &&
      !line.includes('accessibilityLabel') &&
      !line.includes('accessibilityRole'),
  },
  {
    id: 'use-pressable',
    severity: 'warning',
    message: 'Prefer Pressable over TouchableOpacity — Pressable offers full press-state control and better accessibility defaults.',
    test: (line) => /\bTouchableOpacity\b/.test(line),
  },
  {
    id: 'no-leaked-render',
    severity: 'warning',
    message: 'Avoid {value && <Component />} when value can be a falsy string or number — use {value ? <Component /> : null} to prevent a production crash (or coerce with !!value &&).',
    test: (line) => /\{\s*[A-Za-z_$][\w$.?]*\s*&&\s*</.test(line),
  },

  // Performance
  {
    id: 'inline-deps-object',
    severity: 'warning',
    message: 'Avoid creating new objects/arrays inside useEffect/useCallback dependency arrays — causes unnecessary re-runs.',
    test: (line) =>
      /useEffect|useMemo|useCallback\s*\(/.test(line) &&
      /\[\s*\{/.test(line),
  },

  // Code quality
  {
    id: 'var-usage',
    severity: 'warning',
    message: 'Use let or const instead of var.',
    test: (line) => /\bvar\s+/.test(line),
  },
  {
    id: 'loose-equality',
    severity: 'warning',
    message: 'Use strict equality (=== / !==) instead of == / !=.',
    test: (line) => /[^=!]\s*==\s*[^=]|\s*!=\s*[^=]/.test(line),
  },
  {
    id: 'todo-comment',
    severity: 'info',
    message: 'Address the TODO or FIXME before merge.',
    test: (line) => /\b(TODO|FIXME|HACK|XXX)\b/.test(line),
  },
  {
    id: 'magic-number',
    severity: 'info',
    message: 'Extract magic numbers into named constants.',
    test: (line) => {
      const m = line.match(/\b\d{2,}\b/)
      if (!m) return false
      const num = parseInt(m[0], 10)
      // Allow common harmless numbers
      return num !== 0 && num !== 1 && num !== 100 && num !== 24 && num !== 60 && num !== 1000
    },
  },
  {
    id: 'unreachable-code',
    severity: 'warning',
    message: 'Code after return/throw/break is unreachable.',
    test: (line, lines, i) => {
      const prev = lines[i - 1]?.trim()
      if (!prev) return false
      return /\breturn\b|\bthrow\b|\bbreak\b/.test(prev) && line.trim() !== '}' && line.trim() !== ''
    },
  },

  // Error handling
  {
    id: 'no-empty-catch',
    severity: 'error',
    message: 'Catch blocks must handle or rethrow the error.',
    test: (line, lines, i) => {
      const trimmed = lines[i].trim()
      if (/catch\s*\([^)]*\)\s*\{\s*\}/.test(trimmed)) return true
      if (!/catch\s*\([^)]*\)\s*\{\s*$/.test(trimmed)) return false
      const next = lines[i + 1]
      return next !== undefined && next.trim() === '}'
    },
  },
  {
    id: 'unhandled-promise',
    severity: 'warning',
    message: 'Promises should be awaited or have .catch() / try-catch.',
    test: (line) => /\.(then|catch)\s*\(/.test(line) && !/await\s+/.test(line) && !/new\s+Promise/.test(line),
  },
  {
    id: 'throw-in-async',
    severity: 'warning',
    message: 'Use Promise.reject() or throw inside an async function with await, not bare throw in promise chains.',
    test: (line) => /\bthrow\s+/.test(line) && /\.then\s*\(/.test(line),
  },

  // Modern JS
  {
    id: 'no-delete-object-prop',
    severity: 'warning',
    message: 'Avoid delete on object properties; prefer setting to undefined or restructuring.',
    test: (line) => /\bdelete\s+/.test(line),
  },
  {
    id: 'prefer-optional-chain',
    severity: 'info',
    message: 'Prefer optional chaining (?.) over manual null checks where safe.',
    test: (line) => /&&\s*\w+\s*!==\s*null\s*&&/.test(line) || /\?\?\s*null/.test(line),
  },
]

export class CodeReviewAnalyzer {
  private rules: RuleDef[]

  constructor(rules: RuleDef[] = RULES) {
    this.rules = rules
  }

  /**
   * Review a code file. `runtime` optionally carries Hermes profiling metrics
   * (blocking / retention / leak / regression); each metric whose function
   * name appears in the file becomes a runtime-evidence finding with concrete
   * numbers, so reviews surface measured behavior, not just static rules.
   */
  review(code: string, _language = 'tsx', runtime?: PerfRuntimeMetric[]): ReviewFinding[] {
    const findings: ReviewFinding[] = []
    const lines = code.split('\n')

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      for (const rule of this.rules) {
        if (rule.test(line, lines, i)) {
          findings.push({
            severity: rule.severity,
            rule: rule.id,
            message: rule.message,
            line: i + 1,
          })
        }
      }
    }

    if (runtime && runtime.length > 0) {
      findings.push(...this.runtimeFindings(code, runtime))
    }

    return findings.sort((a, b) => a.line - b.line)
  }

  /** Turn matching runtime metrics into findings pinned to the first line the
   * function name appears on — preferring a call site over an import/mention. */
  private runtimeFindings(code: string, runtime: PerfRuntimeMetric[]): ReviewFinding[] {
    const lines = code.split('\n')
    const out: ReviewFinding[] = []
    for (const m of runtime) {
      const esc = escapeRegex(m.function)
      const callRe = new RegExp(`\\b${esc}\\s*\\(`)
      const mentionRe = new RegExp(`\\b${esc}\\b`)
      let lineIdx = lines.findIndex(l => callRe.test(l))
      if (lineIdx === -1) lineIdx = lines.findIndex(l => mentionRe.test(l))
      if (lineIdx === -1) continue
      out.push({
        severity: m.metric === 'blocking' && (m.valueMs ?? 0) >= 1000 ? 'error' : 'warning',
        rule: `runtime-${m.metric}`,
        message: formatRuntimeMetricMessage(m),
        line: lineIdx + 1,
      })
    }
    return out
  }

  render(findings: ReviewFinding[]): string {
    const lines = [
      'Code Review',
      '===========',
      '',
      findings.length === 0
        ? 'No findings — clean code.'
        : `${findings.length} finding${findings.length === 1 ? '' : 's'}`,
      '',
      ...findings.map(f => [
        `[${f.severity}] ${f.rule} (line ${f.line})`,
        `  ${f.message}`,
        '',
      ]).flat(),
    ]
    return lines.join('\n')
  }

  /** Return the list of active rules for reporting. */
  getRules(): RuleDef[] {
    return [...this.rules]
  }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export { RULES }
