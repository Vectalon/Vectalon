export interface RefactorSuggestion {
  severity: 'high' | 'medium' | 'low'
  pattern: string
  suggestion: string
}

const MAX_FILE_LINES = 300
const MAX_FUNCTION_LINES = 25

export class RefactorSuggester {
  suggest(code: string, filename = 'Component.tsx'): RefactorSuggestion[] {
    const suggestions: RefactorSuggestion[] = []
    const lines = code.split('\n')

    if (lines.length > MAX_FILE_LINES) {
      suggestions.push({
        severity: 'high',
        pattern: 'file-too-large',
        suggestion: `Consider splitting ${filename} into smaller modules.`,
      })
    }
    if (/: any\b/.test(code)) {
      suggestions.push({ severity: 'medium', pattern: 'avoid-any', suggestion: 'Replace any with a concrete type.' })
    }
    if (/console\.(log|debug)/.test(code)) {
      suggestions.push({ severity: 'low', pattern: 'no-console-log', suggestion: 'Remove console.log before merging.' })
    }
    if (/\b\d{2,}\b/.test(code)) {
      suggestions.push({ severity: 'low', pattern: 'magic-numbers', suggestion: 'Extract magic numbers into named constants.' })
    }
    for (const name of this.findLongFunctions(lines)) {
      suggestions.push({
        severity: 'medium',
        pattern: 'long-function',
        suggestion: `Break the long function "${name}" into smaller helpers.`,
      })
    }

    return suggestions
  }

  render(suggestions: RefactorSuggestion[]): string {
    const lines = [
      'Refactor Suggestions',
      '====================',
      '',
      suggestions.length === 0 ? 'No refactor suggestions.' : `${suggestions.length} suggestion${suggestions.length === 1 ? '' : 's'}`,
      '',
      ...suggestions.map(s => [
        `- [${s.severity}] ${s.pattern}`,
        `  ${s.suggestion}`,
        '',
      ]).flat(),
    ]
    return lines.join('\n')
  }

  private findLongFunctions(lines: string[]): string[] {
    const found: string[] = []
    let depth = 0
    let candidate: { name: string; start: number } | null = null

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const braces = countBraces(line)

      if (!candidate) {
        const match = line.match(/(?:const\s+(\w+)\s*=\s*\([^)]*\)\s*=>|function\s+(\w+)\s*\()/)
        if (match) {
          const name = match[1] || match[2]
          if (braces.open > 0) {
            candidate = { name, start: i }
            depth = braces.open
          }
        }
        continue
      }

      depth += braces.open - braces.close
      if (depth <= 0) {
        if (i - candidate.start > MAX_FUNCTION_LINES) found.push(candidate.name)
        candidate = null
      }
    }

    return found
  }
}

function countBraces(line: string): { open: number; close: number } {
  let open = 0
  let close = 0
  for (const ch of line) {
    if (ch === '{') open++
    else if (ch === '}') close++
  }
  return { open, close }
}
