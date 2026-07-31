import { RootCauseAnalyzer } from './RootCauseAnalyzer'

export interface IncidentInput {
  title: string
  description: string
  severity?: 'sev1' | 'sev2' | 'sev3'
  impact?: string
}

export interface IncidentAnalysis {
  title: string
  severity: string
  impact: string
  causeBucket: string
  probableCause: string
  timeline: string[]
  actions: string[]
}

const SEVERITY_RULES: [string, string[]][] = [
  ['sev1', ['outage', 'data loss', 'security breach', 'all users', 'down']],
  ['sev2', ['degraded', 'slow', 'partial', 'intermittent', 'crash']],
  ['sev3', ['cosmetic', 'typo', 'minor']],
]

const SEVERITY_ACTIONS: Record<string, string[]> = {
  sev1: ['Escalate to on-call immediately', 'Open an incident channel and status page', 'Freeze non-critical deployments'],
  sev2: ['Assign a primary responder', 'Update the incident tracker', 'Prepare a customer update'],
  sev3: ['Log the issue for the next sprint', 'Monitor for recurrence'],
}

export class IncidentAnalyzer {
  analyze(input: IncidentInput): IncidentAnalysis {
    const severity = input.severity || this.detectSeverity(input.description)
    const cause = new RootCauseAnalyzer().analyze(input.description)
    return {
      title: input.title,
      severity,
      impact: input.impact || 'Unknown — assess affected users and services.',
      causeBucket: cause.bucket,
      probableCause: cause.probableCause,
      timeline: ['Detected: TBD', 'Investigation began: TBD', 'Contained: TBD', 'Resolved: TBD'],
      actions: [...(SEVERITY_ACTIONS[severity] || []), ...cause.investigation],
    }
  }

  render(analysis: IncidentAnalysis): string {
    return [
      'Incident Analysis',
      '=================',
      '',
      `Title: ${analysis.title}`,
      '',
      `Severity: ${analysis.severity}`,
      `Impact: ${analysis.impact}`,
      `Cause bucket: ${analysis.causeBucket}`,
      `Probable cause: ${analysis.probableCause}`,
      '',
      'Timeline',
      '--------',
      ...analysis.timeline.map(t => `- ${t}`),
      '',
      'Actions',
      '-------',
      ...analysis.actions.map(a => `- ${a}`),
      '',
    ].join('\n')
  }

  private detectSeverity(description: string): string {
    const lower = description.toLowerCase()
    for (const [severity, keywords] of SEVERITY_RULES) {
      if (keywords.some(keyword => lower.includes(keyword))) return severity
    }
    return 'sev2'
  }
}
