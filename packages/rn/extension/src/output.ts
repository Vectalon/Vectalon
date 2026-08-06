import * as vscode from 'vscode'

let channel: vscode.OutputChannel | null = null

/** Shared output channel for all Vectalon activity (lazy singleton). */
export function getOutputChannel(): vscode.OutputChannel {
  if (!channel) {
    channel = vscode.window.createOutputChannel('Vectalon')
  }
  return channel
}

export function log(message: string): void {
  getOutputChannel().appendLine(`[${new Date().toISOString()}] ${message}`)
}

export function disposeOutputChannel(): void {
  channel?.dispose()
  channel = null
}
