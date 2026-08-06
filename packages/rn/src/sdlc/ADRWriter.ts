export interface ADRInput {
  title: string
  context: string
  options?: string[]
  decision?: string
  number?: number
  status?: 'proposed' | 'accepted' | 'deprecated' | 'superseded'
}

export class ADRWriter {
  writeADR(input: ADRInput): string {
    const { title, context, options = [], decision = 'TBD', number = 1, status = 'proposed' } = input
    const optionList = options.length ? options.map(o => `- ${o}`).join('\n') : '- TBD'

    return [
      `# ADR-${number}: ${title}`,
      '',
      `Status: ${status}`,
      `Date: ${new Date().toISOString().slice(0, 10)}`,
      '',
      '## Context',
      '',
      context,
      '',
      '## Decision',
      '',
      decision,
      '',
      '## Options Considered',
      '',
      optionList,
      '',
      '## Consequences',
      '',
      '- TBD',
      '',
      '## References',
      '',
      '- TBD',
      '',
    ].join('\n')
  }
}
