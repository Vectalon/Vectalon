export interface SWOTInput {
  strengths: string[]
  weaknesses: string[]
  opportunities: string[]
  threats: string[]
}

export interface SWOTAnalysis {
  strengths: string[]
  weaknesses: string[]
  opportunities: string[]
  threats: string[]
  strategies: {
    so: string[]
    wo: string[]
    st: string[]
    wt: string[]
  }
}

export class SWOTAnalyzer {
  analyze(input: SWOTInput): SWOTAnalysis {
    const { strengths, weaknesses, opportunities, threats } = input
    return {
      strengths,
      weaknesses,
      opportunities,
      threats,
      strategies: {
        so: combine(strengths, opportunities),
        wo: combine(weaknesses, opportunities),
        st: combine(strengths, threats),
        wt: combine(weaknesses, threats),
      },
    }
  }

  render(analysis: SWOTAnalysis): string {
    const { strengths, weaknesses, opportunities, threats, strategies } = analysis
    return [
      'SWOT Analysis',
      '=============',
      '',
      'Strengths',
      '---------',
      ...listOrPlaceholder(strengths),
      '',
      'Weaknesses',
      '----------',
      ...listOrPlaceholder(weaknesses),
      '',
      'Opportunities',
      '-------------',
      ...listOrPlaceholder(opportunities),
      '',
      'Threats',
      '-------',
      ...listOrPlaceholder(threats),
      '',
      'Strategies',
      '----------',
      'SO (strength-opportunity):',
      ...listOrPlaceholder(strategies.so),
      'WO (weakness-opportunity):',
      ...listOrPlaceholder(strategies.wo),
      'ST (strength-threat):',
      ...listOrPlaceholder(strategies.st),
      'WT (weakness-threat):',
      ...listOrPlaceholder(strategies.wt),
      '',
    ].join('\n')
  }
}

function combine(left: string[], right: string[]): string[] {
  const pairs: string[] = []
  for (const l of left) {
    for (const r of right) {
      pairs.push(`Leverage ${l.toLowerCase()} to capture ${r.toLowerCase()}`)
    }
  }
  return pairs
}

function listOrPlaceholder(items: string[]): string[] {
  if (items.length === 0) return ['- none']
  return items.map(i => `- ${i}`)
}
