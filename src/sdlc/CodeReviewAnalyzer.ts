export interface ReviewFinding {
  severity: 'error' | 'warning' | 'info'
  rule: string
  message: string
  line: number
}

export class CodeReviewAnalyzer {
  review(code: string, _language = 'tsx'): ReviewFinding[] {
    const findings: ReviewFinding[] = []
    const lines = code.split('\n')

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const number = i + 1

      if (/console\.(log|debug)/.test(line)) {
        findings.push({ severity: 'warning', rule: 'no-console-log', message: 'Remove console.log before merging.', line: number })
      }
      if (/: any\b|<any>/.test(line)) {
        findings.push({ severity: 'warning', rule: 'no-any', message: 'Avoid the any type; use a concrete type.', line: number })
      }
      if (/\b(TODO|FIXME)\b/.test(line)) {
        findings.push({ severity: 'info', rule: 'todo-comment', message: 'Address the TODO/FIXME before merge.', line: number })
      }
      if (/style=\{\{/.test(line)) {
        findings.push({ severity: 'info', rule: 'inline-style', message: 'Prefer StyleSheet.create over inline styles.', line: number })
      }
      if (/@ts-ignore/.test(line)) {
        findings.push({ severity: 'warning', rule: 'no-ts-ignore', message: 'Replace @ts-ignore with a typed fix.', line: number })
      }
      if (this.isEmptyCatch(lines, i)) {
        findings.push({ severity: 'error', rule: 'no-empty-catch', message: 'Catch blocks must handle or rethrow the error.', line: number })
      }
    }

    return findings
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

  private isEmptyCatch(lines: string[], index: number): boolean {
    const trimmed = lines[index].trim()
    if (/catch\s*\([^)]*\)\s*\{\s*\}/.test(trimmed)) return true
    if (!/catch\s*\([^)]*\)\s*\{\s*$/.test(trimmed)) return false
    const next = lines[index + 1]
    return next !== undefined && next.trim() === '}'
  }
}
