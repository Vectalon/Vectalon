/**
 * `src/utils/suggestionsReport.ts` — the self-contained HTML dashboard for
 * `vectalon suggestions --open`. Single file, no network; severity cards with
 * current → latest versions and the exact install command.
 */
import { renderSuggestionsHtmlReport, installCommandFor } from '../../src/utils/suggestionsReport'
import type { ImprovementSuggestion } from '../../src/knowledge/refresh/types'

const BASE: ImprovementSuggestion = {
  id: 'dep-react-native-0.85.0-1',
  sourceId: 'registry-react-native',
  severity: 'error',
  library: 'react-native',
  currentVersion: '0.76.0',
  latestVersion: '0.85.0',
  title: 'react-native is 9 version(s) behind latest',
  description: 'Current: 0.76.0. Latest: 0.85.0. Consider upgrading.',
  createdAt: 1700000000000,
}

describe('installCommandFor', () => {
  it('builds the exact npm install command with ^latest', () => {
    expect(installCommandFor(BASE)).toBe('npm install react-native@^0.85.0')
  })
})

describe('renderSuggestionsHtmlReport', () => {
  it('renders severity cards with versions, the command, and npm links', () => {
    const html = renderSuggestionsHtmlReport({
      generatedAt: '2026-08-11T00:00:00.000Z',
      toolVersion: '0.1.29',
      suggestions: [BASE],
      lastRefreshAt: 1700000000000,
    })
    expect(html).toContain('vectalon suggestions')
    expect(html).toContain('react-native is 9 version(s) behind latest')
    expect(html).toContain('current 0.76.0')
    expect(html).toContain('latest 0.85.0')
    expect(html).toContain('npm install react-native@^0.85.0')
    expect(html).toContain('https://www.npmjs.com/package/react-native')
    // Counts in the stats row
    expect(html).toMatch(/<div class="stat error"><b>1<\/b>/)
  })

  it('groups severity counts across multiple suggestions', () => {
    const html = renderSuggestionsHtmlReport({
      generatedAt: '2026-08-11T00:00:00.000Z',
      toolVersion: '0.1.29',
      suggestions: [
        BASE,
        { ...BASE, id: 'b', severity: 'warning', library: 'lodash', latestVersion: '5.0.0' },
        { ...BASE, id: 'c', severity: 'info', library: 'axios', latestVersion: '1.7.0' },
      ],
    })
    expect(html).toMatch(/<div class="stat error"><b>1<\/b>/)
    expect(html).toMatch(/<div class="stat warning"><b>1<\/b>/)
    expect(html).toMatch(/<div class="stat info"><b>1<\/b>/)
    expect(html).toContain('lodash')
    expect(html).toContain('axios')
  })

  it('escapes library names and titles (no HTML injection from npm data)', () => {
    const malicious: ImprovementSuggestion = {
      ...BASE,
      library: '<img src=x onerror=alert(1)>',
      title: '"><script>alert(2)</script>',
    }
    const html = renderSuggestionsHtmlReport({
      generatedAt: '2026-08-11T00:00:00.000Z',
      toolVersion: '0.1.29',
      suggestions: [malicious],
    })
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('<img src=x')
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('&lt;img src=x')
    // The npm link href is escaped too — no injected attribute breaks out.
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
  })

  it('renders an empty state when there are no suggestions', () => {
    const html = renderSuggestionsHtmlReport({
      generatedAt: '2026-08-11T00:00:00.000Z',
      toolVersion: '0.1.29',
      suggestions: [],
    })
    expect(html).toContain('No improvement suggestions on file')
    expect(html).toMatch(/<div class="stat error"><b>0<\/b>/)
  })
})
