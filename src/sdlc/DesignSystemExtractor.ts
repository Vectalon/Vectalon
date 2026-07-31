export interface DesignToken {
  value: string
  count: number
}

export interface DesignSystem {
  colors: DesignToken[]
  spacing: DesignToken[]
  fontSizes: DesignToken[]
  borderRadius: DesignToken[]
}

export class DesignSystemExtractor {
  extract(code: string): DesignSystem {
    return {
      colors: this.tally(this.scan(code, /#[0-9a-fA-F]{3,8}\b/g).map(v => v.toLowerCase())),
      spacing: this.tally(this.scan(code, /(?:margin|padding)[A-Za-z]*:\s*(\d+)/g, 1)),
      fontSizes: this.tally(this.scan(code, /fontSize:\s*(\d+)/g, 1)),
      borderRadius: this.tally(this.scan(code, /borderRadius:\s*(\d+)/g, 1)),
    }
  }

  render(ds: DesignSystem): string {
    const lines = [
      'Design System',
      '=============',
      '',
      'Colors',
      '------',
      ...tokensOrPlaceholder(ds.colors),
      '',
      'Spacing',
      '-------',
      ...tokensOrPlaceholder(ds.spacing),
      '',
      'fontSizes',
      '---------',
      ...tokensOrPlaceholder(ds.fontSizes),
      '',
      'borderRadius',
      '------------',
      ...tokensOrPlaceholder(ds.borderRadius),
      '',
    ]
    return lines.join('\n')
  }

  private scan(code: string, pattern: RegExp, group = 0): string[] {
    const values: string[] = []
    let match: RegExpExecArray | null
    while ((match = pattern.exec(code)) !== null) {
      values.push(match[group])
    }
    return values
  }

  private tally(values: string[]): DesignToken[] {
    const counts = new Map<string, number>()
    for (const value of values) {
      counts.set(value, (counts.get(value) || 0) + 1)
    }
    return [...counts.entries()].map(([value, count]) => ({ value, count }))
  }
}

function tokensOrPlaceholder(tokens: DesignToken[]): string[] {
  if (tokens.length === 0) return ['- none']
  return tokens.map(t => `- ${t.value} (x${t.count})`)
}
