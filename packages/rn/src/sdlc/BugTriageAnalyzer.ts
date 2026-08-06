export type TriageSeverity = 'critical' | 'high' | 'medium' | 'low'
export type TriagePriority = 'p0' | 'p1' | 'p2' | 'p3'

export interface BugTriage {
  id: string
  title: string
  severity: TriageSeverity
  priority: TriagePriority
  recommendation: string
}

const SEVERITY_RULES: [TriageSeverity, string[]][] = [
  ['critical', ['crash', 'crashed', 'crashing', 'data loss', 'security', 'payment', 'blocked', 'blank screen', 'freeze', 'cannot', 'unable']],
  ['high', ['error', 'fail', 'fails', 'failed', 'broken', 'corrupt', 'not working', 'sync']],
  ['medium', ['slow', 'lag', 'incorrect', 'wrong', 'missing', 'invalid']],
  ['low', ['typo', 'cosmetic', 'style', 'ui', 'alignment', 'minor', 'wording', 'label', 'padding']],
]

const PRIORITY: Record<TriageSeverity, TriagePriority> = {
  critical: 'p0',
  high: 'p1',
  medium: 'p2',
  low: 'p3',
}

const PRIORITY_RANK: Record<TriagePriority, number> = { p0: 0, p1: 1, p2: 2, p3: 3 }

const RECOMMENDATIONS: Record<TriagePriority, string> = {
  p0: 'Fix immediately and block release.',
  p1: 'Fix before the next release; assign top priority.',
  p2: 'Schedule for an upcoming sprint.',
  p3: 'Fix when convenient; low impact.',
}

export class BugTriageAnalyzer {
  triage(bugs: string[]): BugTriage[] {
    const triaged = bugs.map((title, index) => {
      const severity = this.detectSeverity(title)
      const priority = PRIORITY[severity]
      return {
        id: `B-${index + 1}`,
        title,
        severity,
        priority,
        recommendation: RECOMMENDATIONS[priority],
      }
    })
    return triaged.sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority])
  }

  render(triaged: BugTriage[]): string {
    const lines = [
      'Bug Triage',
      '==========',
      '',
      ...triaged.flatMap(bug => [
        `${bug.id} [${bug.priority} / ${bug.severity}] ${bug.title}`,
        `    ${bug.recommendation}`,
        '',
      ]),
    ]
    return lines.join('\n')
  }

  private detectSeverity(title: string): TriageSeverity {
    const lower = title.toLowerCase()
    for (const [severity, keywords] of SEVERITY_RULES) {
      if (keywords.some(keyword => lower.includes(keyword))) return severity
    }
    return 'medium'
  }
}
