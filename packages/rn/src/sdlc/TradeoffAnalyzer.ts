export interface TradeoffOption {
  name: string
  scores: Record<string, number>
}

export interface TradeoffRanking {
  name: string
  total: number
  average: number
}

export interface TradeoffResult {
  ranking: TradeoffRanking[]
  best: string | null
}

export class TradeoffAnalyzer {
  analyze(options: TradeoffOption[]): TradeoffResult {
    const ranking: TradeoffRanking[] = options.map(option => {
      const values = Object.values(option.scores)
      const total = values.reduce((sum, v) => sum + v, 0)
      return {
        name: option.name,
        total,
        average: values.length ? Math.round((total / values.length) * 100) / 100 : 0,
      }
    })
    ranking.sort((a, b) => b.total - a.total)
    return { ranking, best: ranking.length ? ranking[0].name : null }
  }

  render(result: TradeoffResult): string {
    const lines = [
      'Tradeoff Analysis',
      '=================',
      '',
      'Ranking',
      '-------',
      ...result.ranking.map((r, i) => `${i + 1}. ${r.name} (total ${r.total}, average ${r.average.toFixed(2)})`),
      '',
      `Best option: ${result.best || 'none'}`,
      '',
    ]
    return lines.join('\n')
  }
}
