export type WireframeSectionType = 'header' | 'hero' | 'list' | 'card' | 'button' | 'input' | 'footer' | 'image' | 'text'

export interface WireframeSection {
  type: WireframeSectionType
  label?: string
}

const WIDTH = 46

export class WireframeGenerator {
  generate(title: string, sections: (WireframeSection | string)[] = []): string {
    const lines = [
      `# ${title}`,
      '',
      border(),
      line(`HEADER ${title}`),
      border(),
      ...sections.map(section => this.renderSection(section)),
      border(),
      '',
    ]
    return lines.join('\n')
  }

  renderDefault(title: string): string {
    return this.generate(title, ['header', 'hero', 'list', 'footer'])
  }

  private renderSection(section: WireframeSection | string): string {
    const resolved = this.normalizeSection(section)
    const label = resolved.label || resolved.type
    switch (resolved.type) {
      case 'header':
        return line(`HEADER ${label}`)
      case 'hero':
        return line(`HERO ${label}`)
      case 'image':
        return line(`[IMAGE ${label}]`)
      case 'card':
        return line(`[CARD ${label}]`)
      case 'button':
        return line(`[ BUTTON ${label} ]`)
      case 'input':
        return line(`( INPUT ${label} )`)
      case 'list':
        return [
          line(`LIST ${label}`),
          line('- item 1'),
          line('- item 2'),
          line('- item 3'),
        ].join('\n')
      case 'footer':
        return line(`FOOTER ${label}`)
      default:
        return line(`TEXT ${label}`)
    }
  }

  private normalizeSection(section: WireframeSection | string): WireframeSection {
    if (typeof section !== 'string') {
      return { type: section.type, label: section.label || section.type }
    }
    const colon = section.indexOf(':')
    if (colon === -1) return { type: coerceType(section), label: section }
    return {
      type: coerceType(section.slice(0, colon)),
      label: section.slice(colon + 1).trim(),
    }
  }
}

function coerceType(value: string): WireframeSectionType {
  return value.includes('header')
    ? 'header'
    : value.includes('hero')
      ? 'hero'
      : value.includes('list')
        ? 'list'
        : value.includes('card')
          ? 'card'
          : value.includes('button')
            ? 'button'
            : value.includes('input')
              ? 'input'
              : value.includes('footer')
                ? 'footer'
                : value.includes('image')
                  ? 'image'
                  : 'text'
}

function border(): string {
  return '+' + '-'.repeat(WIDTH - 2) + '+'
}

function line(content: string): string {
  const inner = content.length > WIDTH - 4 ? content.slice(0, WIDTH - 7) + '...' : content
  return `| ${inner}${' '.repeat(WIDTH - 4 - inner.length)} |`
}
