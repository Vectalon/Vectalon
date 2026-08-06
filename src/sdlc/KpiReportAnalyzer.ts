import type { ParsedAnalyticsEvent, ParsedCrash, ParsedTrace, TelemetryEvent } from '../knowledge/telemetry'

export interface KpiMetric {
  name: string
  current: number
  previous?: number
  target?: number
}

export type KpiStatus = 'on-track' | 'below-target' | 'no-target' | 'no-baseline'

export interface KpiResultMetric {
  name: string
  current: number
  change: number | null
  changePercent: number | null
  status: KpiStatus
}

export interface KpiResult {
  metrics: KpiResultMetric[]
}

export interface TelemetryKpiOptions {
  /**
   * Target values keyed by metric name. Only higher-is-better metrics honor
   * targets (`crash-free-sessions`); lower-is-better metrics (crashes,
   * affected-users, avg-trace-duration-ms) report `no-target` so a crash
   * budget can never be mislabeled as on-track by the shared comparator.
   */
  target?: Record<string, number>
  /** Previous-period baselines keyed by metric name. */
  previous?: Record<string, number>
  /** Number of sessions observed in the window, used to compute the crash-free rate. */
  sessions?: number
}

/** Metric names where a higher value is better (targets apply). */
const HIGHER_IS_BETTER = new Set(['crash-free-sessions'])

export class KpiReportAnalyzer {
  analyze(metrics: KpiMetric[]): KpiResult {
    return {
      metrics: metrics.map(metric => {
        if (metric.previous === undefined) {
          return {
            name: metric.name,
            current: metric.current,
            change: null,
            changePercent: null,
            status: 'no-baseline',
          }
        }
        const change = metric.current - metric.previous
        const changePercent = metric.previous === 0 ? null : Math.round((change / metric.previous) * 10000) / 100
        const status = metric.target === undefined ? 'no-target' : metric.current >= metric.target ? 'on-track' : 'below-target'
        return { name: metric.name, current: metric.current, change, changePercent, status }
      }),
    }
  }

  /**
   * Build a KPI report directly from ingested runtime telemetry: crash counts,
   * the crash-free session rate, unique affected users, and average trace
   * durations — no manual metric entry required.
   */
  analyzeFromEvents(events: TelemetryEvent[], options: TelemetryKpiOptions = {}): KpiResult {
    const crashes = events.filter((e): e is ParsedCrash => e.kind === 'crash')
    const traces = events.filter((e): e is ParsedTrace => e.kind === 'performance')
    const analytics = events.filter((e): e is ParsedAnalyticsEvent => e.kind === 'analytics')

    const affectedUsers = new Set(crashes.map(c => c.user?.id).filter((id): id is string => !!id)).size
    const traceDurations = traces.map(t => t.durationMs)
    const avgTraceDuration = traceDurations.length > 0
      ? Math.round(traceDurations.reduce((sum, d) => sum + d, 0) / traceDurations.length)
      : 0

    const eventCounts = new Map<string, number>()
    for (const event of analytics) {
      eventCounts.set(event.name, (eventCounts.get(event.name) || 0) + 1)
    }
    const topEvent = [...eventCounts.entries()].sort((a, b) => b[1] - a[1])[0]

    const sessions = options.sessions ?? this.inferSessions(analytics)
    const crashFreeRate = sessions !== undefined && sessions > 0
      ? Math.round(((sessions - crashes.length) / sessions) * 10000) / 100
      : undefined

    const targetFor = (name: string): number | undefined => (HIGHER_IS_BETTER.has(name) ? options.target?.[name] : undefined)
    const metrics: KpiMetric[] = [
      { name: 'crashes', current: crashes.length, previous: options.previous?.crashes, target: targetFor('crashes') },
      ...(affectedUsers > 0
        ? [{ name: 'affected-users', current: affectedUsers, previous: options.previous?.['affected-users'], target: targetFor('affected-users') }]
        : []),
      ...(crashFreeRate !== undefined
        ? [{ name: 'crash-free-sessions', current: crashFreeRate, previous: options.previous?.['crash-free-sessions'], target: targetFor('crash-free-sessions') }]
        : []),
      ...(traceDurations.length > 0
        ? [
            {
              name: 'avg-trace-duration-ms',
              current: avgTraceDuration,
              previous: options.previous?.['avg-trace-duration-ms'],
              target: targetFor('avg-trace-duration-ms'),
            },
          ]
        : []),
      ...(topEvent
        ? [
            {
              name: `top-event-${topEvent[0]}`,
              current: topEvent[1],
              previous: options.previous?.[`top-event-${topEvent[0]}`],
              target: targetFor(`top-event-${topEvent[0]}`),
            },
          ]
        : []),
    ]

    return this.analyze(metrics)
  }

  private inferSessions(analytics: ParsedAnalyticsEvent[]): number | undefined {
    const starts = analytics.filter(a => /session_start/i.test(a.name)).length
    if (starts > 0) return starts
    // Fall back to unique users as a session proxy when no session_start events.
    const users = new Set(analytics.map(a => a.userId).filter((id): id is string => !!id)).size
    return users > 0 ? users : undefined
  }

  render(result: KpiResult): string {
    const lines = [
      'KPI Report',
      '==========',
      '',
      ...result.metrics.map(m => {
        const changeText = m.change === null
          ? 'no baseline'
          : `${m.change >= 0 ? '+' : ''}${m.change} (${m.changePercent === null ? 'n/a' : `${m.changePercent >= 0 ? '+' : ''}${m.changePercent}%`} vs previous)`
        return `- ${m.name}: ${m.current} (${changeText}) — ${m.status}`
      }),
      '',
    ]
    return lines.join('\n')
  }
}
