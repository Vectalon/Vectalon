/**
 * vectalon cicd — CI/CD Intelligence Agent (Roadmap Phase 9, item 073)
 * Business Source License 1.1 (BSL-1.1)
 *
 * One deterministic pass over CI workflow files. GitHub Actions workflows
 * get the full check set; other CI files (GitLab CI, Travis, Jenkins,
 * CircleCI) are detected and named. Reports to docs/vectalon/cicd/
 * (gitignored).
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs'
import { join, relative } from 'path'
import type { CiFinding, CiReport } from './types'

export type { CiFinding, CiReport } from './types'

/** Where cicd reports are written. */
export const cicdDocsDir = (root: string): string => join(root, 'docs', 'vectalon', 'cicd')

const GITHUB_WORKFLOWS_DIR = join('.github', 'workflows')
const OTHER_CI_FILES = ['gitlab-ci.yml', '.gitlab-ci.yml', '.travis.yml', 'Jenkinsfile', 'azure-pipelines.yml', '.circleci', 'bitrise.yml', 'codemagic.yaml']

export function verdictOf(findings: CiFinding[]): CiReport['verdict'] {
  if (findings.some(f => f.severity === 'error')) return 'changes-requested'
  if (findings.some(f => f.severity === 'warning')) return 'needs-attention'
  return 'approved'
}

/** Collect the CI files present in the project. */
export function collectCiFiles(root: string): string[] {
  const out: string[] = []
  const workflowsDir = join(root, GITHUB_WORKFLOWS_DIR)
  if (existsSync(workflowsDir)) {
    for (const f of readdirSync(workflowsDir)) {
      if (/\.(yml|yaml)$/.test(f)) out.push(join(workflowsDir, f))
    }
  }
  for (const f of OTHER_CI_FILES) {
    const p = join(root, f)
    if (existsSync(p)) out.push(p)
  }
  return out
}

export function detectCiSystems(files: string[]): string[] {
  const systems = new Set<string>()
  for (const f of files) {
    const n = f.replace(/\\/g, '/')
    if (n.includes('.github/workflows')) systems.add('github-actions')
    if (n.includes('gitlab-ci') || n.endsWith('.gitlab-ci.yml')) systems.add('gitlab-ci')
    if (n.endsWith('.travis.yml')) systems.add('travis-ci')
    if (n.endsWith('Jenkinsfile')) systems.add('jenkins')
    if (n.includes('.circleci')) systems.add('circleci')
    if (n.endsWith('azure-pipelines.yml')) systems.add('azure-pipelines')
    if (n.endsWith('bitrise.yml')) systems.add('bitrise')
    if (n.endsWith('codemagic.yaml')) systems.add('codemagic')
  }
  return [...systems]
}

/** Scan one GitHub Actions workflow (line-based; no YAML dependency). */
export function scanWorkflow(file: string, content: string): CiFinding[] {
  const findings: CiFinding[] = []
  const lines = content.split('\n')
  const rel = relative(process.cwd(), file)
  const push = (id: string, severity: CiFinding['severity'], line: number, message: string, suggestion: string) =>
    findings.push({ id, severity, file: rel, line, message, suggestion })

  const trimmed = content.trim()
  if (!trimmed) return findings
  if (!/^on:/m.test(trimmed) && !/^'?on'?:/m.test(trimmed)) {
    push('missing-triggers', 'warning', 1, 'Workflow has no `on:` trigger block', 'Add `on:` with the events that should run this workflow (push, pull_request, workflow_dispatch).')
  } else if (!/workflow_dispatch/.test(trimmed)) {
    push('no-manual-trigger', 'info', 1, 'Workflow cannot be triggered manually', 'Add `workflow_dispatch:` to `on:` so operators can re-run it without a push.')
  }
  if (!/concurrency:/.test(trimmed)) {
    push('missing-concurrency', 'warning', 1, 'No concurrency group — parallel pushes can run the same workflow twice', 'Add a `concurrency` group keyed on the ref (e.g. `group: ${{ github.ref }}`, `cancel-in-progress: true`).')
  }

  let sawTestStep = false
  let sawDeployStep = false
  let sawUsesOrRun = false
  const inlineEnvValues: { line: number; value: string }[] = []

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue

    // Pin third-party actions to a SHA, not a moving tag/branch. (YAML list
    // items carry a leading `- ` marker, so match both `uses:` and `- uses:`.)
    const uses = line.match(/^(?:-\s+)?uses:\s*([^\s#]+)/)
    if (uses) {
      const ref = uses[1]
      const isSha = /@[0-9a-f]{40}$/.test(ref)
      if (!isSha && !ref.startsWith('./')) {
        push('unpinned-action', 'warning', i + 1, `Action ${ref} is pinned to a tag/branch, not a commit SHA`, 'Pin to the full 40-char SHA (e.g. `@abc123…`) so a compromised tag cannot change your pipeline.')
      }
      sawUsesOrRun = true
    }
    const run = line.match(/^(?:-\s+)?run:\s*(.+)$/)
    if (run) {
      sawUsesOrRun = true
      const cmd = run[1].toLowerCase()
      if (/npm (run )?(test|lint|typecheck)|jest|vitest|detox|maestro|gradle test|swift test|xcrun xcodebuild test/.test(cmd)) sawTestStep = true
      if (/(deploy|publish|release|upload|promote)/.test(cmd)) sawDeployStep = true
      // Secrets in inline env values — should reference ${{ secrets.* }}.
      if (/(sk_|AKIA|ghp_|xoxb-|password\s*=|secret\s*=|token\s*=|api[_-]?key\s*=)/.test(run[1])) {
        inlineEnvValues.push({ line: i + 1, value: run[1] })
      }
    }
    if (line.startsWith('timeout-minutes:')) {
      const t = Number(line.split(':')[1]?.trim())
      if (t === 0 || Number.isNaN(t)) push('no-timeout', 'warning', i + 1, 'timeout-minutes is unset or invalid', 'Set a timeout-minutes per job so hung pipelines fail fast.')
    }
  }

  if (!sawUsesOrRun) push('empty-workflow', 'error', 1, 'Workflow has no steps with `uses:` or `run:`', 'Every job needs at least one step — add build/test steps.')
  if (sawDeployStep && !sawTestStep) {
    push('deploy-without-tests', 'error', 1, 'Workflow deploys but has no test step', 'Add a test/lint/typecheck gate before any deploy or publish step.')
  }
  for (const v of inlineEnvValues) {
    push('inline-secret', 'warning', v.line, 'Potential secret value inline in a run step', 'Reference `${{ secrets.NAME }}` instead of embedding values in workflow YAML.')
  }
  return findings
}

/** Run one CI/CD intelligence pass. */
export function runCiScan(root: string): CiReport {
  const scannedAt = Date.now()
  const files = collectCiFiles(root)
  const findings: CiFinding[] = []
  for (const file of files) {
    const content = readFileSync(file, 'utf-8')
    if (file.replace(/\\/g, '/').includes('.github/workflows')) {
      findings.push(...scanWorkflow(file, content))
    } else {
      // Non-GitHub CI: light presence checks only.
      const rel = relative(root, file).replace(/\\/g, '/')
      const sys = rel.includes('gitlab') ? 'GitLab CI' : rel.includes('travis') ? 'Travis CI' : rel.includes('Jenkins') ? 'Jenkins' : rel.includes('circleci') ? 'CircleCI' : rel.includes('azure') ? 'Azure Pipelines' : rel.includes('bitrise') ? 'Bitrise' : 'Codemagic'
      findings.push({
        id: 'other-ci-present', severity: 'info', file: rel, line: 1,
        message: `${sys} configuration detected`,
        suggestion: 'The full anti-pattern check set applies to GitHub Actions workflows — run them through the same lens or migrate to a single CI system.',
      })
    }
  }
  const bySeverity: Record<string, number> = {}
  for (const f of findings) bySeverity[f.severity] = (bySeverity[f.severity] ?? 0) + 1
  return {
    scannedAt,
    root,
    ciSystems: detectCiSystems(files),
    files: files.map(f => relative(root, f).replace(/\\/g, '/')),
    findings,
    verdict: verdictOf(findings),
    summary: { total: findings.length, bySeverity },
  }
}

/** Render the CI scan as markdown. */
export function renderCiMarkdown(report: CiReport): string {
  const lines = ['# vectalon cicd — CI/CD Intelligence', '']
  lines.push(`Systems: ${report.ciSystems.join(', ') || 'none detected'}  ·  Files: ${report.files.length}  ·  Verdict: **${report.verdict}**`, '')
  if (report.findings.length === 0) {
    lines.push('No CI anti-patterns found.', '')
  }
  for (const f of report.findings) {
    const mark = f.severity === 'error' ? 'ERROR' : f.severity === 'warning' ? 'WARN' : 'INFO'
    lines.push(`### [${mark}] ${f.id} — \`${f.file}:${f.line}\``, '', f.message, '', `**Fix**: ${f.suggestion}`, '')
  }
  return lines.join('\n')
}

/** Write the markdown + JSON report. */
export function writeCiReport(root: string, report: CiReport): { mdPath: string; jsonPath: string } {
  const dir = cicdDocsDir(root)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const md = renderCiMarkdown(report)
  const json = JSON.stringify(report, null, 2)
  const mdPath = join(dir, 'report.md')
  const jsonPath = join(dir, 'report.json')
  writeFileSync(mdPath, md, 'utf-8')
  writeFileSync(jsonPath, json, 'utf-8')
  return { mdPath, jsonPath }
}
