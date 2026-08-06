import * as vscode from 'vscode'

/** Render markdown-style tool output in a reusable webview panel. */
export class PreviewPanel {
  private static current: PreviewPanel | null = null

  private constructor(private readonly panel: vscode.WebviewPanel) {}

  static show(title: string, content: string): void {
    if (PreviewPanel.current) {
      PreviewPanel.current.panel.dispose()
      PreviewPanel.current = null
    }
    const panel = vscode.window.createWebviewPanel(
      'vectalon.preview',
      title,
      vscode.ViewColumn.Beside,
      { enableScripts: false, localResourceRoots: [] }
    )
    panel.webview.html = renderHtml(title, content)
    panel.onDidDispose(() => {
      if (PreviewPanel.current?.panel === panel) {
        PreviewPanel.current = null
      }
    })
    PreviewPanel.current = new PreviewPanel(panel)
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/**
 * Minimal markdown-to-HTML: code fences, headings, lists, and bold — enough
 * for tool output without pulling in a markdown dependency.
 */
export function renderMarkdown(markdown: string): string {
  const lines = markdown.split('\n')
  const html: string[] = []
  let inFence = false
  for (const line of lines) {
    if (/^```/.test(line)) {
      inFence = !inFence
      html.push(inFence ? '<pre>' : '</pre>')
      continue
    }
    if (inFence) {
      html.push(escapeHtml(line))
      continue
    }
    const heading = line.match(/^(#{1,6})\s+(.+)$/)
    if (heading) {
      const level = Math.min(heading[1].length, 6)
      html.push(`<h${level}>${escapeHtml(heading[2])}</h${level}>`)
      continue
    }
    if (/^\s*[-*]\s+/.test(line)) {
      html.push(`<li>${escapeHtml(line.replace(/^\s*[-*]\s+/, ''))}</li>`)
      continue
    }
    if (line.trim() === '') {
      html.push('<br>')
      continue
    }
    html.push(`<p>${escapeHtml(line)}</p>`)
  }
  return html.join('\n')
}

function renderHtml(title: string, content: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  body { font-family: var(--vscode-font-family); padding: 16px; color: var(--vscode-foreground); }
  h1, h2, h3 { color: var(--vscode-editor-foreground); }
  pre { background: var(--vscode-textCodeBlock-background); padding: 12px; border-radius: 6px; overflow-x: auto; }
  li { margin: 2px 0; }
</style>
<title>${escapeHtml(title)}</title>
</head>
<body>
<h1>${escapeHtml(title)}</h1>
${renderMarkdown(content)}
</body>
</html>`
}
