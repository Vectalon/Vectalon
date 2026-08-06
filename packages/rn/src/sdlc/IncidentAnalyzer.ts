import { RootCauseAnalyzer } from './RootCauseAnalyzer'
import type { ParsedCrash, ParsedTrace } from '../knowledge/telemetry'

export interface IncidentInput {
  title: string
  description: string
  severity?: 'sev1' | 'sev2' | 'sev3'
  impact?: string
  /** Runtime crash reports that triggered or correlate with the incident. */
  crashes?: ParsedCrash[]
  /** Performance traces that degraded during the incident window. */
  traces?: ParsedTrace[]
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
    const rootCause = new RootCauseAnalyzer()
    const severity = input.severity || this.detectSeverity(input.description, input.crashes || [])
    const cause = this.primaryCrashCause(input.crashes || []) || rootCause.analyze(input.description)

    const crashSummary = this.summarizeCrashes(input.crashes || [])
    const traceSummary = this.summarizeTraces(input.traces || [])
    const impact = input.impact || crashSummary || 'Unknown — assess affected users and services.'

    const timeline: string[] = []
    const earliestCrash = (input.crashes || [])
      .map(c => c.timestamp)
      .filter((t): t is number => t !== undefined)
      .sort((a, b) => a - b)[0]
    timeline.push(`Detected: ${earliestCrash ? new Date(earliestCrash).toISOString() : 'TBD'}`)
    timeline.push('Investigation began: TBD')
    timeline.push('Contained: TBD')
    timeline.push('Resolved: TBD')

    return {
      title: input.title,
      severity,
      impact,
      causeBucket: cause.bucket,
      probableCause: cause.probableCause,
      timeline,
      actions: [...(SEVERITY_ACTIONS[severity] || []), ...cause.investigation, ...(traceSummary ? [`Performance: ${traceSummary}`] : [])],
    }
  }

  private primaryCrashCause(crashes: ParsedCrash[]): ReturnType<RootCauseAnalyzer['analyzeCrash']> | null {
    if (crashes.length === 0) return null
    // Analyze the most frequent exception type in the batch.
    const counts = new Map<string, ParsedCrash[]>()
    for (const crash of crashes) {
      const key = crash.exceptionType || crash.message || crash.id
      const group = counts.get(key) || []
      group.push(crash)
      counts.set(key, group)
    }
    const top = [...counts.entries()].sort((a, b) => b[1].length - a[1].length)[0]
    return new RootCauseAnalyzer().analyzeCrash(top[1][0])
  }

  private summarizeCrashes(crashes: ParsedCrash[]): string | null {
    if (crashes.length === 0) return null
    const users = new Set(crashes.map(c => c.user?.id).filter((id): id is string => !!id))
    const releases = new Set(crashes.map(c => c.release).filter((r): r is string => !!r))
    const parts = [`${crashes.length} crash report(s)`]
    if (users.size > 0) parts.push(`across ${users.size} user(s)`)
    if (releases.size > 0) parts.push(`in release ${[...releases].join(', ')}`)
    return parts.join(' ')
  }

  private summarizeTraces(traces: ParsedTrace[]): string | null {
    if (traces.length === 0) return null
    const slow = traces.filter(t => t.durationMs > 2000)
    if (slow.length === 0) return null
    const worst = slow.sort((a, b) => b.durationMs - a.durationMs)[0]
    return `${slow.length} slow trace(s); worst ${worst.name} at ${worst.durationMs} ms`
  }

  private detectSeverity(description: string, crashes: ParsedCrash[]): string {
    const lower = description.toLowerCase()
    for (const [severity, keywords] of SEVERITY_RULES) {
      if (keywords.some(keyword => lower.includes(keyword))) return severity
    }
    // Data-driven severity: native crashes and memory pressure impact a broad
    // user base and typically need urgent attention.
    if (crashes.length > 0) {
      const types = crashes.map(c => (c.exceptionType || c.message || '').toLowerCase()).join(' ')
      const sev1Keywords = ['out of memory', 'sigsegv', 'sigabrt', 'nullpointerexception', 'nsinvalidargumentexception']
      if (crashes.length >= 5 || sev1Keywords.some(k => types.includes(k))) return 'sev1'
      return 'sev2'
    }
    return 'sev2'
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
}


