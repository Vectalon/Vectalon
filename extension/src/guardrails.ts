import * as vscode from 'vscode'
import { McpHttpClient } from './client'
import { parseGuardrailResult, failingFindings, severityToNumber, summarize } from './guardrailResult'
import { log } from './output'

/** Debounce guardrail runs triggered by editor/save events. */
const RUN_DEBOUNCE_MS = 400

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

  const runNow = async (uri: vscode.Uri): Promise<void> => {
    try {
      const document = await vscode.workspace.openTextDocument(uri)
      const content = document.getText()
      if (!content.trim()) {
        diagnostics.delete(uri)
        return
      }
      const raw = await client.callTool('check_guardrails', {
        content,
        filePath: uri.fsPath,
      })
      const result = parseGuardrailResult(raw.content)
      if (!result) {
        log(`Unparseable guardrail result for ${uri.fsPath}`)
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
