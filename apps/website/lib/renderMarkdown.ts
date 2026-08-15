/**
 * Tiny dependency-free markdown renderer for the /reports documents.
 *
 * Covers the constructs the agent reports actually use — ATX headings,
 * bold/italic, inline code, fenced code blocks (with a single-pass token
 * highlighter), pipe tables, `-`/`*` lists, ordered lists, blockquotes, and
 * `---` rules. Everything is HTML-escaped; nothing is dangerously injected.
 */

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Inline formatting on one line: code first, then bold, then italic. */
function inline(raw: string): string {
  let s = esc(raw)
  s = s.replace(/`([^`]+)`/g, (_m, c) => `<code class="tk-code">${c}</code>`)
  s = s.replace(/\*\*([^*]+)\*\*/g, (_m, b) => `<strong>${b}</strong>`)
  s = s.replace(/(^|[^*])\*([^*\s][^*]*?)\*(?!\*)/g, (_m, pre, it) => `${pre}<em>${it}</em>`)
  return s
}

/** Single-pass tokenizer so spans never nest: comment → string → number →
 * keyword → call. Advances by finding the nearest token start. */
export function highlightCode(code: string): string {
  const src = esc(code)
  const rules: Array<{ re: RegExp; cls: string }> = [
    { re: /\/\/[^\n]*|\/\*[\s\S]*?\*\//, cls: 'tk-com' },
    { re: /&quot;[^&]*?&quot;|'[^'\n]*'/, cls: 'tk-str' },
    { re: /`[^`\n]*`/, cls: 'tk-str' },
    { re: /\b\d+(?:\.\d+)?\b/, cls: 'tk-num' },
    {
      re: /\b(?:const|let|var|function|return|import|from|export|if|else|for|while|new|await|async|type|interface|enum|class|extends|of|in|true|false|null|undefined|throw|try|catch|require|yield|default|static|readonly)\b/,
      cls: 'tk-kw',
    },
    { re: /[A-Za-z_$][\w$]*(?=\()/, cls: 'tk-fn' },
  ]
  const out: string[] = []
  let i = 0
  while (i < src.length) {
    const rest = src.slice(i)
    let matched = false
    for (const rule of rules) {
      rule.re.lastIndex = 0
      const m = rule.re.exec(rest)
      if (m && m.index === 0) {
        out.push(`<span class="${rule.cls}">${m[0]}</span>`)
        i += m[0].length
        matched = true
        break
      }
    }
    if (matched) continue
    // Copy the plain run up to the next token start.
    let next = rest.length
    for (const rule of rules) {
      rule.re.lastIndex = 0
      const m = rule.re.exec(rest)
      if (m && m.index > 0 && m.index < next) next = m.index
    }
    out.push(rest.slice(0, next))
    i += next
  }
  return out.join('')
}

function renderCode(_lang: string, body: string): string {
  return `<pre class="tk-pre"><code class="tk-block">${highlightCode(body)}</code></pre>`
}

const SEPARATOR = /^\s*\|?[\s:|-]+\|?\s*$/

function splitCells(row: string): string[] {
  return row
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map(c => c.trim())
}

function parseTable(lines: string[], start: number): { html: string; next: number } {
  const header = splitCells(lines[start])
  let i = start + 1
  if (i < lines.length && SEPARATOR.test(lines[i]) && lines[i].includes('-')) i++
  const rows: string[][] = []
  while (i < lines.length && lines[i].trim().startsWith('|')) {
    rows.push(splitCells(lines[i]))
    i++
  }
  const thead = `<thead><tr>${header.map(c => `<th>${inline(c)}</th>`).join('')}</tr></thead>`
  const tbody = rows
    .map(r => `<tr>${r.map((c, idx) => `<td${idx === 0 ? ' class="tk-first"' : ''}>${inline(c)}</td>`).join('')}</tr>`)
    .join('')
  return { html: `<div class="tk-table-wrap"><table>${thead}${tbody}</table></div>`, next: i }
}

/** Render a report document to styled HTML. */
export function renderMarkdown(md: string): string {
  const lines = md.replace(/\r\n/g, '\n').split('\n')
  const out: string[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    const t = line.trim()

    // fenced code block
    const fence = /^```(\w*)\s*$/.exec(t)
    if (fence) {
      const buf: string[] = []
      i++
      while (i < lines.length && !/^```\s*$/.test(lines[i].trim())) {
        buf.push(lines[i])
        i++
      }
      i++ // closing fence
      out.push(renderCode(fence[1], buf.join('\n')))
      continue
    }

    // ATX heading
    const h = /^(#{1,3})\s+(.*)$/.exec(t)
    if (h) {
      const lvl = h[1].length
      out.push(`<h${lvl} class="tk-h${lvl}">${inline(h[2])}</h${lvl}>`)
      i++
      continue
    }

    // horizontal rule
    if (/^---+\s*$/.test(t)) {
      out.push('<hr class="tk-hr" />')
      i++
      continue
    }

    // blockquote
    if (t.startsWith('>')) {
      const buf: string[] = []
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        buf.push(lines[i].trim().replace(/^>\s?/, ''))
        i++
      }
      out.push(`<blockquote class="tk-quote">${buf.map(inline).join('<br />')}</blockquote>`)
      continue
    }

    // pipe table (header row followed by a separator)
    if (t.startsWith('|') && i + 1 < lines.length && SEPARATOR.test(lines[i + 1].trim()) && lines[i + 1].includes('-')) {
      const table = parseTable(lines, i)
      out.push(table.html)
      i = table.next
      continue
    }

    // unordered list
    if (/^[-*]\s+/.test(t)) {
      const items: string[] = []
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(inline(lines[i].replace(/^\s*[-*]\s+/, '')))
        i++
      }
      out.push(`<ul class="tk-ul">${items.map(it => `<li>${it}</li>`).join('')}</ul>`)
      continue
    }

    // ordered list
    if (/^\d+\.\s+/.test(t)) {
      const items: string[] = []
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(inline(lines[i].replace(/^\s*\d+\.\s+/, '')))
        i++
      }
      out.push(`<ol class="tk-ol">${items.map(it => `<li>${it}</li>`).join('')}</ol>`)
      continue
    }

    // paragraph — accumulate consecutive plain lines
    if (t.length > 0) {
      const buf: string[] = [t]
      i++
      while (i < lines.length) {
        const t2 = lines[i].trim()
        if (
          t2.length === 0 ||
          /^(#{1,3}\s|```|\|)/.test(t2) ||
          /^[-*]\s+/.test(t2) ||
          /^\d+\.\s+/.test(t2) ||
          t2.startsWith('>') ||
          /^---+\s*$/.test(t2)
        )
          break
        buf.push(t2)
        i++
      }
      out.push(`<p class="tk-p">${buf.map(inline).join(' ')}</p>`)
      continue
    }

    i++
  }
  return out.join('\n')
}
