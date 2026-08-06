/** Pure URL helpers for the serve connection (vscode-free, unit-testable). */

export function portFromUrl(url: string): number {
  try {
    const parsed = new URL(url)
    const port = Number(parsed.port)
    return Number.isFinite(port) && port > 0 ? port : 8765
  } catch {
    return 8765
  }
}

export function baseUrlFromPort(port: number): string {
  return `http://localhost:${port}`
}
