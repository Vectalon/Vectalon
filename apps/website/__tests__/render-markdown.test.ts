/**
 * The /reports page renders 40 real agent documents through the tiny
 * markdown renderer in lib/renderMarkdown.ts. These tests lock the
 * constructs the reports actually use: headings, tables, lists, bold,
 * inline code, fenced code blocks with token spans, blockquotes — and the
 * guarantee that document content is always HTML-escaped.
 */
import { renderMarkdown, highlightCode } from '../lib/renderMarkdown'

describe('renderMarkdown', () => {
  it('renders a title as an h1', () => {
    const html = renderMarkdown('# vectalon crash — Crash Intelligence\n')
    expect(html).toContain('<h1 class="tk-h1">')
    expect(html).toContain('vectalon crash — Crash Intelligence')
  })

  it('renders bold and inline code', () => {
    const html = renderMarkdown('- Verdict: **changes-requested**\n- Run `vectalon crash`\n')
    expect(html).toContain('<strong>changes-requested</strong>')
    expect(html).toContain('<code class="tk-code">vectalon crash</code>')
  })

  it('renders pipe tables with a header row', () => {
    const md = '| Package | Severity |\n|---|---|\n| metro | high |\n'
    const html = renderMarkdown(md)
    expect(html).toContain('<table>')
    expect(html).toContain('<th>Package</th>')
    expect(html).toContain('metro</td>')
  })

  it('renders fenced code blocks with token spans', () => {
    const md = '```json\n{ "severity": "high", "count": 3 }\n```\n'
    const html = renderMarkdown(md)
    expect(html).toContain('<pre class="tk-pre">')
    expect(html).toContain('tk-str')
    expect(html).toContain('tk-num')
  })

  it('renders unordered lists with brand markers', () => {
    const html = renderMarkdown('- one\n- two\n')
    expect(html).toContain('<ul class="tk-ul">')
    expect(html).toContain('<li>one</li>')
  })

  it('renders blockquotes', () => {
    const html = renderMarkdown('> hold the release\n')
    expect(html).toContain('<blockquote class="tk-quote">')
    expect(html).toContain('hold the release')
  })

  it('never injects raw HTML from document content', () => {
    const html = renderMarkdown('# <script>alert(1)</script>\n`<img onerror=x>`\n')
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('<img')
    expect(html).toContain('&lt;script&gt;')
  })
})

describe('highlightCode', () => {
  it('colors keywords, strings, numbers, comments, and calls without nesting', () => {
    const html = highlightCode('const x = fetch("a") // note\n')
    expect(html).toContain('tk-kw')
    expect(html).toContain('tk-str')
    expect(html).toContain('tk-fn')
    expect(html).toContain('tk-com')
    // a keyword inside a string must not be double-wrapped
    expect(html.match(/tk-kw/g)?.length).toBe(1)
  })
})
