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
