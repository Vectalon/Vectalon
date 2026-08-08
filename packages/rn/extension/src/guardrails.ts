import * as vscode from 'vscode'
import { McpHttpClient } from './client'
import { parseGuardrailResult, failingFindings, severityToNumber, summarize } from './guardrailResult'
import { withTimeout } from './retry'
import { log } from './output'

/** Debounce guardrail runs triggered by editor/save events. */
const RUN_DEBOUNCE_MS = 400
/** Hard cap on a single guardrail check (P0-9) — never hang the editor. */
const RUN_TIMEOUT_MS = 3_000

/** The single diagnostic emitted when a file cannot be analyzed (P0-9). */
const PARSE_FAILURE_MESSAGE = 'Vectalon: could not parse file'

export interface GuardrailRunner {
  /** Run guardrails on a document and push findings to the Problems panel. */
  run(uri: vscode.Uri): Promise<void>
  /** Clear findings for a document (e.g. when it is closed). */
  clear(uri: vscode.Uri): void
  /** Last summary text for the status bar. */
  lastSummary(): string
}

export function createGuardrailRunner(
  client: McpHttpClient,
  diagnostics: vscode.DiagnosticCollection
): GuardrailRunner {
  let debounceTimer: NodeJS.Timeout | null = null
  let lastSummary = ''

  const setParseFailure = (uri: vscode.Uri): void => {
    lastSummary = PARSE_FAILURE_MESSAGE
    const range = new vscode.Range(0, 0, 0, 0)
    diagnostics.set(uri, [
      new vscode.Diagnostic(range, PARSE_FAILURE_MESSAGE, vscode.DiagnosticSeverity.Warning),
    ])
  }

  const runNow = async (uri: vscode.Uri): Promise<void> => {
    let document: vscode.TextDocument
    try {
      document = await vscode.workspace.openTextDocument(uri)
    } catch (err) {
      log(`Guardrails: could not open ${uri.fsPath}: ${err instanceof Error ? err.message : String(err)}`)
      return
    }
    try {
      // P0-8: fast availability pre-check (2s cap) — a down server skips
      // silently instead of blocking the editor on the default 15s timeout.
      if (!(await client.pingQuick())) {
        log(`Guardrails: server not reachable — skipping check for ${uri.fsPath} (non-blocking)`)
        return
      }
      const content = document.getText()
      if (!content.trim()) {
        diagnostics.delete(uri)
        return
      }
      // P0-9: a 3s cap on the request — a hung server check degrades to one
      // diagnostic, never a frozen editor or extension host.
      const raw = await withTimeout(
        client.callTool('check_guardrails', {
          content,
          filePath: uri.fsPath,
        }),
        RUN_TIMEOUT_MS,
        'guardrail check'
      )
      const result = parseGuardrailResult(raw.content)
      if (!result) {
        log(`Unparseable guardrail result for ${uri.fsPath}`)
        setParseFailure(uri)
        return
      }
      const entries: [vscode.Uri, vscode.Diagnostic[]] = [uri, []]
      for (const finding of failingFindings(result)) {
        const line = Math.max(0, (finding.line || 1) - 1)
        const range = document.lineAt(Math.min(line, document.lineCount - 1)).range
        entries[1].push(
          new vscode.Diagnostic(
            range,
            finding.message || finding.rule,
            severityToNumber(finding.severity) as vscode.DiagnosticSeverity
          )
        )
      }
      lastSummary = summarize(result)
      diagnostics.set(entries[0], entries[1])
    } catch (err) {
      log(`Guardrail check failed: ${err instanceof Error ? err.message : String(err)}`)
      setParseFailure(uri)
    }
  }

  return {
    run(uri: vscode.Uri): Promise<void> {
      if (debounceTimer) clearTimeout(debounceTimer)
      return new Promise(resolve => {
        debounceTimer = setTimeout(() => {
          void runNow(uri).then(resolve)
        }, RUN_DEBOUNCE_MS)
      })
    },
    clear(uri: vscode.Uri): void {
      diagnostics.delete(uri)
    },
    lastSummary(): string {
      return lastSummary
    },
  }
}

/** The file extensions that get inline guardrail checking. */
export function isCheckableFile(uri: vscode.Uri): boolean {
  return /\.[jt]sx?$/.test(uri.fsPath)
}
