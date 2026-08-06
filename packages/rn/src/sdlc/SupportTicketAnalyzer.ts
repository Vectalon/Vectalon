export interface TicketTheme {
  theme: string
  count: number
  example: string
}

export interface TicketAnalysis {
  total: number
  themes: TicketTheme[]
  topIssue: string | null
  recommendations: string[]
}

const THEME_KEYWORDS: Record<string, string[]> = {
  crash: ['crash', 'crashed', 'crashing', 'force close', 'blank screen', 'white screen'],
  login: ['login', 'log in', 'sign in', 'password', 'auth', 'logout'],
  sync: ['sync', 'not updating', 'stale', 'out of date', 'data loss'],
  performance: ['slow', 'lag', 'freeze', 'frozen', 'jank', 'hangs', 'unresponsive'],
  network: ['network', 'offline', 'connection', 'timeout', 'time out', 'connect'],
  camera: ['camera', 'photo', 'picture', 'video', 'image'],
  notifications: ['notification', 'push', 'alert'],
  billing: ['billing', 'charge', 'charged', 'payment', 'refund', 'subscription'],
}

const THEME_RECOMMENDATIONS: Record<string, string> = {
  crash: 'Prioritize crash reports with stack traces and automate uploads.',
  login: 'Review the authentication flow and error messaging for sign-in.',
  sync: 'Investigate sync logic, retries, and conflict resolution.',
  performance: 'Profile screen render times and long-running work on the main thread.',
  network: 'Harden offline handling and connection retry behaviour.',
  camera: 'Verify camera permissions and device compatibility.',
  notifications: 'Check push token registration and notification routing.',
  billing: 'Review billing hooks and refund handling with the payments team.',
  other: 'Categorise these manually and look for emerging patterns.',
}

export class SupportTicketAnalyzer {
  analyze(tickets: string[]): TicketAnalysis {
    const counts = new Map<string, number>()
    const examples = new Map<string, string>()

    for (const ticket of tickets) {
      const text = ticket.trim()
      if (!text) continue
      const theme = this.detectTheme(text)
      counts.set(theme, (counts.get(theme) || 0) + 1)
      if (!examples.has(theme)) examples.set(theme, text)
    }

    const themes: TicketTheme[] = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([theme, count]) => ({ theme, count, example: examples.get(theme) || '' }))

    return {
      total: tickets.filter(t => t.trim()).length,
      themes,
      topIssue: themes.length ? themes[0].theme : null,
      recommendations: themes.map(t => THEME_RECOMMENDATIONS[t.theme] || THEME_RECOMMENDATIONS.other),
    }
  }

  render(analysis: TicketAnalysis): string {
    const lines = [
      'Support Ticket Analysis',
      '=======================',
      '',
      `Total tickets: ${analysis.total}`,
      '',
      'Themes',
      '------',
      ...analysis.themes.map(t => `- ${t.theme} (${t.count}): ${t.example}`),
      '',
      `Top issue: ${analysis.topIssue || 'none'}`,
      '',
      'Recommendations',
      '---------------',
      ...analysis.recommendations.map(r => `- ${r}`),
      '',
    ]
    return lines.join('\n')
  }

  private detectTheme(text: string): string {
    const lower = text.toLowerCase()
    for (const [theme, keywords] of Object.entries(THEME_KEYWORDS)) {
      if (keywords.some(keyword => lower.includes(keyword))) return theme
    }
    return 'other'
  }
}
