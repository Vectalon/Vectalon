export interface GapInput {
  desired: string[]
  current: string[]
}

export interface GapAnalysis {
  missing: string[]
  partial: string[]
  met: string[]
  recommendations: string[]
}

export class GapAnalyzer {
  analyze(input: GapInput): GapAnalysis {
    const desired = input.desired.map(d => d.trim()).filter(Boolean)
    const current = input.current.map(c => c.trim()).filter(Boolean)

    const missing: string[] = []
    const partial: string[] = []
    const met: string[] = []

    for (const item of desired) {
      const lower = item.toLowerCase()
      const exact = current.find(c => c.toLowerCase() === lower)
      if (exact) {
        met.push(item)
      } else if (current.some(c => lower.includes(c.toLowerCase()))) {
        partial.push(item)
      } else {
        missing.push(item)
      }
    }

    return {
      missing,
      partial,
      met,
      recommendations: missing.map(item => `Implement ${item}`),
    }
  }

  render(analysis: GapAnalysis): string {
    const sections = [
      'Gap Analysis',
      '============',
      '',
      `Missing (${analysis.missing.length})`,
      '-----------',
      ...listOrPlaceholder(analysis.missing),
      '',
      `Partial (${analysis.partial.length})`,
      '----------',
      ...listOrPlaceholder(analysis.partial),
      '',
      `Met (${analysis.met.length})`,
      '------',
      ...listOrPlaceholder(analysis.met),
      '',
      'Recommendations',
      '---------------',
      ...listOrPlaceholder(analysis.recommendations),
      '',
    ]
    return sections.join('\n')
  }
}

function listOrPlaceholder(items: string[]): string[] {
  if (items.length === 0) return ['- none']
  return items.map(i => `- ${i}`)
}
