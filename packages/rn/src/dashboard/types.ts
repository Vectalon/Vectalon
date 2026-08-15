/**
 * vectalon dashboard — Engineering Dashboard (Roadmap Phase 9, item 079)
 * Business Source License 1.1 (BSL-1.1)
 *
 * Aggregates every `vectalon` agent report under docs/vectalon/* into one
 * executive view: per-agent health, an overall verdict, and a self-contained
 * HTML dashboard (no network). `--run` regenerates the fast Phase 9/10 core
 * reports (release-ready, arch-score, soc2, figma, sentry, observability,
 * governance, audit, repos, release-predict, play-store, dataset, lora)
 * first so the dashboard is never empty.
 */

/** One normalized finding rendered inside the dashboard drill-down. */
export interface DashboardFinding {
  id?: string
  severity: string
  message: string
  suggestion?: string
}

export interface DashboardAgent {
  agent: string
  verdict: string
  total: number
  errors: number
  warnings: number
  infos: number
  /** Root-relative path to the agent's report.json. */
  reportFile?: string
  /** Root-relative path to the agent's report.md. */
  reportMd?: string
  /** Normalized findings (capped) for the HTML drill-down. */
  findings?: DashboardFinding[]
}

export interface DashboardReport {
  generatedAt: number
  root: string
  agents: DashboardAgent[]
  overall: 'approved' | 'needs-attention' | 'changes-requested'
  summary: { agents: number; findings: number; errors: number; warnings: number; infos: number }
  htmlPath?: string
}

export interface DashboardOptions {
  /** Regenerate the fast Phase 9/10 core reports first (see module docs). */
  run?: boolean
}
