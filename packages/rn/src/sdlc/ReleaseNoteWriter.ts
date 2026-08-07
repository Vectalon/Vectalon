export type ReleaseNoteCategory = 'added' | 'changed' | 'fixed' | 'removed' | 'security' | 'performance' | 'deprecated' | 'other'

export interface ReleaseNoteInput {
  version: string
  date?: string
  changes: string[]
}

const CATEGORY_RULES: [ReleaseNoteCategory, string[]][] = [
  ['security', ['security', 'vulnerability', 'cve']],
  ['performance', ['performance', 'faster', 'speed', 'optimize', 'optimised', 'optimized', 'latency']],
  ['removed', ['remove', 'removed', 'drop', 'dropped', 'delete', 'deleted']],
  ['deprecated', ['deprecate', 'deprecated']],
  ['fixed', ['fix', 'fixes', 'fixed', 'resolve', 'resolved', 'repair', 'bug']],
  ['added', ['add', 'added', 'new', 'introduce', 'introduced', 'introduces', 'support for', 'feature']],
  ['changed', ['update', 'updated', 'upgrade', 'upgraded', 'change', 'changed', 'bump', 'revamp']],
]

export const SECTION_ORDER: ReleaseNoteCategory[] = ['added', 'changed', 'fixed', 'removed', 'security', 'performance', 'deprecated', 'other']

export const SECTION_TITLES: Record<ReleaseNoteCategory, string> = {
  added: 'Added',
  changed: 'Changed',
  fixed: 'Fixed',
  removed: 'Removed',
  security: 'Security',
  performance: 'Performance',
  deprecated: 'Deprecated',
  other: 'Other',
}

/** Classify a single change line into a release-note category (deterministic). */
export function categorizeChange(change: string): ReleaseNoteCategory {
  const lower = change.toLowerCase()
  for (const [category, keywords] of CATEGORY_RULES) {
    if (keywords.some(keyword => lower.includes(keyword))) return category
  }
  return 'other'
}

export class ReleaseNoteWriter {
  writeReleaseNotes(input: ReleaseNoteInput): string {
    const { version, date = new Date().toISOString().slice(0, 10), changes } = input
    const grouped = new Map<ReleaseNoteCategory, string[]>()
    for (const change of changes) {
      const category = categorizeChange(change)
      grouped.set(category, [...(grouped.get(category) || []), change])
    }

    const lines = [
      `# Release Notes — v${version}`,
      '',
      `Release date: ${date}`,
      '',
    ]
    for (const category of SECTION_ORDER) {
      const items = grouped.get(category)
      if (!items || items.length === 0) continue
      lines.push(`## ${SECTION_TITLES[category]}`, '', ...items.map(i => `- ${i}`), '')
    }
    return lines.join('\n')
  }
}
