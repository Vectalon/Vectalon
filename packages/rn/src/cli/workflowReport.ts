import pc from 'picocolors'
import type { PhaseResult, WorkflowState } from '../adapters/types'

// ── small ANSI-aware layout helpers (mirrors the ecosystem command) ─────────

const ANSI_RE = new RegExp(String.fromCharCode(27) + '\\[[0-9;]*m', 'g')

/**
 * Strip ANSI color codes. clack's note() box computes width from raw line
 * length, so colored summary lines would misalign its border — strip before
 * rendering into the box (colors still show in stage lines and the feed).
 */
export function stripAnsi(s: string): string {
  return s.replace(ANSI_RE, '')
}

function visibleWidth(s: string): number {
  return stripAnsi(s).length
}

function pad(s: string, width: number): string {
  const fill = width - visibleWidth(s)
  return fill > 0 ? s + ' '.repeat(fill) : s
}

export function formatDuration(startedAt?: number, completedAt?: number): string {
  if (startedAt === undefined || completedAt === undefined) return ''
  const ms = completedAt - startedAt
  if (ms < 1000) return `${ms}ms`
  const s = ms / 1000
  if (s < 60) return `${s.toFixed(1)}s`
  const m = Math.floor(s / 60)
  const rem = Math.round(s % 60)
  return `${m}m ${rem}s`
}

// ── verification report parsing ────────────────────────────────────────────

export interface CheckResult {
  name: string
  status: 'passed' | 'failed' | 'skipped' | 'unknown'
  exitCode?: number
  detail: string
  /** stderr content of the check, or '' when the check printed none. */
  stderr: string
  /** stdout content of the check, or '' when the check printed none. */
  stdout: string
}

const CHECK_LINE_RE = /^- (.+?):\s*(failed|passed|pass|skipped|FAIL|error)\s*(?:\(([^)]*)\))?\s*(?:—\s*(.*))?$/i

/**
 * Parse a `# Verification report` phase output into structured check results.
 * The report format is `- <name>: <status> (exit N)` followed by optional
 * fenced **stderr** / **stdout** blocks. Robust to the report being truncated:
 * a check whose line was cut off simply carries no output.
 */
export function parseVerificationReport(output: string): CheckResult[] {
  const checks: CheckResult[] = []
  const lines = output.split('\n')

  let current: CheckResult | null = null
  let section: 'stderr' | 'stdout' | null = null
  let inFence = false

  const flush = () => {
    if (current) {
      checks.push(current)
      current = null
    }
    section = null
    inFence = false
  }

  for (const raw of lines) {
    const line = raw.trimEnd()
    const trimmed = raw.trim()

    // A check line that looks like `- Name: failed (exit N)` inside a fenced
    // stderr/stdout block is command output, not a new check — never split on
    // content that sits inside a code fence.
    if (!inFence && CHECK_LINE_RE.test(trimmed)) {
      flush()
      const m = CHECK_LINE_RE.exec(trimmed)!
      const statusRaw = m[2].toLowerCase()
      const status =
        statusRaw === 'failed' || statusRaw === 'error' || statusRaw === 'fail'
          ? 'failed'
          : statusRaw === 'skipped'
            ? 'skipped'
            : 'passed'
      // Paren group may be `exit 1`, `rn-cli-default, exit 0`, or `simulated`.
      const paren = m[3]
      const exitMatch = paren ? /exit\s+(\d+)/i.exec(paren) : null
      current = {
        name: m[1].trim(),
        status,
        exitCode: exitMatch ? Number(exitMatch[1]) : undefined,
        detail: m[4]?.trim() ?? '',
        stderr: '',
        stdout: '',
      }
      continue
    }

    if (!current) continue

    if (trimmed === '**stderr**') {
      section = 'stderr'
      inFence = false
      continue
    }
    if (trimmed === '**stdout**') {
      section = 'stdout'
      inFence = false
      continue
    }

    if (trimmed.startsWith('```')) {
      inFence = !inFence
      continue
    }

    if (section && inFence && current) {
      if (section === 'stderr') {
        current.stderr += (current.stderr ? '\n' : '') + line
      } else {
        current.stdout += (current.stdout ? '\n' : '') + line
      }
    }
  }
  flush()
  return checks
}

/** Compact status marks for a check row. */
function checkMark(status: CheckResult['status']): string {
  switch (status) {
    case 'passed':
      return pc.green('✓')
    case 'failed':
      return pc.red('✖')
    case 'skipped':
      return pc.dim('—')
    default:
      return pc.yellow('?')
  }
}

// Lines that carry no signal when mining a failed check's output for a
// memory fact — coverage-table frames, jest banners, console noise, stack
// frames, timing rows. Anything matching is skipped so the extracted fact
// reads like "lint fails on .vectalon/metro/vectalon-reporter.js", not
// "File | % Stmts | % Branch |…".
const FACT_NOISE_RE =
  /^(PASS |FAIL |● |console\.|at |Time:|Test Suites:|Tests:|Snapshots:|All files\s*\||File\s*\||─+|---|\|\s*\|\s*\|)/i

// Non-fatal logging markers whose CONTENT is app noise (the client's
// `DataInteractor: Starting token renewal`). Content after console.error is
// NOT skipped — in a failing test that is frequently the real failure signal.
const CONSOLE_NOISE_MARKER_RE = /^console\.(debug|log|warn)\b/i

/**
 * Pick the first salient line from a failed check's output (stderr preferred,
 * stdout as fallback) for use in a memory error fact. Returns '' when the
 * output is all noise (e.g. a coverage table with no error line).
 *
 * Console spam is dropped at the marker AND its content block: lines after a
 * `console.debug` marker are the app's log output, not an error — the block
 * stays open until its `at …` stack frame closes it (handles multi-line logs).
 * `console.error` content is kept. Real jest assertion failures (which follow
 * `●` banners) and build errors always surface.
 */
function salientFailureLine(check: CheckResult, root?: string): string {
  for (const source of [check.stderr, check.stdout]) {
    let inConsoleBlock = false
    for (const raw of source.split('\n')) {
      let line = raw.trim()
      if (!line) continue
      if (CONSOLE_NOISE_MARKER_RE.test(line)) {
        inConsoleBlock = true
        continue
      }
      if (inConsoleBlock) {
        // A stack frame closes the console content block; everything before
        // it was the app's logged output.
        if (/^at\s+/i.test(line)) inConsoleBlock = false
        continue
      }
      if (FACT_NOISE_RE.test(line)) continue
      // Relativize machine-specific absolute paths (e.g. the project root)
      // so persisted facts read `.vectalon/metro/vectalon-reporter.js` — not
      // /Users/…/HVACMobileApp/.vectalon/… — and stay valid if the checkout
      // moves.
      if (root && line.startsWith(root)) {
        line = line.slice(root.length).replace(/^[/\\]/, '')
      }
      return line.length > 160 ? line.slice(0, 160) + '…' : line
    }
  }
  return ''
}

/**
 * Extract L1 error facts from a verification phase's output — one per FAILED
 * check — so the L0→L3 memory distiller learns the project's recurring
 * failures ("lint fails on .vectalon/metro/vectalon-reporter.js") and future
 * runs can anticipate them. Passed/skipped checks never produce facts.
 *
 * Statements are compact and deterministic: `<name> failed (exit N): <detail
 * or first salient line>`. Returns [] when the output isn't a verification
 * report or nothing failed.
 */
export function failedCheckFacts(
  output: string,
  root?: string
): Array<{ category: 'error'; statement: string }> {
  const facts: Array<{ category: 'error'; statement: string }> = []
  for (const check of parseVerificationReport(output)) {
    if (check.status !== 'failed') continue
    const exit = check.exitCode !== undefined ? ` (exit ${check.exitCode})` : ''
    const source = check.detail || salientFailureLine(check, root)
    const detail = source ? `: ${source}` : ''
    facts.push({
      category: 'error',
      statement: `${check.name.toLowerCase()} failed${exit}${detail}`,
    })
  }
  return facts
}

/**
 * Render the structured failure card that replaces the raw markdown dump.
 * For the verification phase it parses the report into failing checks with
 * exit codes and an excerpt of the first failure; for any other phase it
 * shows the first lines of the phase output. Always ends with pointers to
 * the full report file, the rotating command log, and the resume command.
 */
export function renderFailureCard(
  phase: PhaseResult,
  opts: { docsFile: string; stateId: string; logFile?: string | null }
): string {
  const lines: string[] = []
  const duration = formatDuration(phase.startedAt, phase.completedAt)
  const head = `✖ ${phase.name} failed${duration ? ` (${duration})` : ''}`
  lines.push(pc.red(head))
  lines.push('')

  if (phase.id === 'verification') {
    const checks = parseVerificationReport(phase.output || '')
    const failed = checks.filter(c => c.status === 'failed')
    const skipped = checks.filter(c => c.status === 'skipped').length
    if (checks.length > 0) {
      lines.push(pc.bold(`  ${failed.length} of ${checks.length} check(s) failed${skipped ? ` · ${skipped} skipped` : ''}:`))
      lines.push('')
      const nameWidth = Math.max(...checks.map(c => c.name.length), 1)
      for (const c of failed) {
        const exit = c.exitCode !== undefined ? ` (exit ${c.exitCode})` : ''
        const detail = c.detail ? ` — ${c.detail}` : ''
        lines.push(`  ${checkMark(c.status)} ${pc.bold(pad(c.name, nameWidth))}${pc.dim(exit)}${pc.dim(detail)}`)
      }
      if (skipped > 0) {
        lines.push(`  ${checkMark('skipped')} ${pc.dim(`${skipped} check(s) skipped — see full report`)}`)
      }

      // Excerpt of the first failing check's stderr (or stdout) — the actual
      // error the developer needs, not the coverage table.
      const first = failed[0]
      if (first) {
        const excerpt = (first.stderr || first.stdout).split('\n').filter(Boolean).slice(0, 12)
        if (excerpt.length > 0) {
          lines.push('')
          lines.push(pc.dim(`  First failure — ${first.name}${first.exitCode !== undefined ? ` (exit ${first.exitCode})` : ''}`))
          lines.push(pc.dim('  ─'.repeat(Math.min(24, first.name.length + 16))))
          for (const line of excerpt) {
            lines.push(`  ${line.length > 140 ? line.slice(0, 140) + '…' : line}`)
          }
          if (excerpt.length >= 12) {
            lines.push(`  ${pc.dim('…and more — see full report below')}`)
          }
        }
      }
    } else {
      // Report not parseable (non-verification output or truncated) — show the
      // tail of the output so the error is still visible.
      const tail = (phase.output || '').split('\n').slice(-20).filter(Boolean)
      for (const line of tail) {
        lines.push(`  ${line.length > 140 ? line.slice(0, 140) + '…' : line}`)
      }
    }
  } else {
    const body = (phase.output || '').split('\n').slice(0, 25)
    for (const line of body) {
      lines.push(`  ${line.length > 140 ? line.slice(0, 140) + '…' : line}`)
    }
  }

  lines.push('')
  lines.push(pc.bold('  Where to look next'))
  lines.push(`  ${pc.dim('Full report:')} ${opts.docsFile}`)
  if (opts.logFile) {
    lines.push(`  ${pc.dim('Command log:')} ${opts.logFile}`)
  }
  lines.push(`  ${pc.dim('Resume:')}      ${pc.cyan(`vectalon feature --resume ${opts.stateId}`)} (after fixing the issues above)`)
  return lines.join('\n')
}

// ── summary rendering ──────────────────────────────────────────────────────

function stageMark(status: PhaseResult['status']): string {
  switch (status) {
    case 'completed':
      return pc.green('✓')
    case 'failed':
      return pc.red('✖')
    case 'skipped':
      return pc.dim('—')
    default:
      return pc.yellow('◌')
  }
}

export interface SummaryContext {
  model: string
  skills: string[]
  intentLabel?: string
  commands: Array<{ command: string; exitCode?: number; success: boolean; durationMs?: number }>
  docsDir: string
  docFiles: string[]
  logFile?: string | null
}

/**
 * Build the terminal summary for a finished workflow run. Plain aligned rows
 * (never a bordered table that truncates), numbered SDLC stages with marks
 * and durations, files, documents, commands, and the context block.
 */
export function renderWorkflowSummary(
  result: WorkflowState,
  workflowName: string,
  root: string,
  ctx: SummaryContext
): string {
  const lines: string[] = []
  const total = result.phases.length

  lines.push(`Workflow: ${workflowName}`)
  lines.push(`ID: ${result.id}`)
  // Status word stays plain so log parsers/tests match 'Status: completed'.
  lines.push(`Status: ${result.status}`)
  lines.push(`Model: ${ctx.model}`)

  // SDLC stage pipeline — numbered, marked, with durations.
  lines.push('')
  lines.push(pc.bold(`SDLC stages (${total})`))
  const nameWidth = Math.max(...result.phases.map(p => p.name.length), 1)
  for (let i = 0; i < result.phases.length; i++) {
    const p = result.phases[i]
    const num = pc.dim(`${String(i + 1).padStart(2)}.`)
    const duration = formatDuration(p.startedAt, p.completedAt)
    const dur = duration ? pc.dim(` (${duration})`) : ''
    lines.push(`  ${stageMark(p.status)} ${num} ${pad(p.name, nameWidth)}${dur}`)
  }

  // Files created or modified.
  const fileArtifacts = result.phases.flatMap(p => p.artifacts).filter(a => a.path && a.type !== 'document')
  if (fileArtifacts.length > 0) {
    lines.push('')
    lines.push(pc.bold('Files created or modified:'))
    for (const artifact of fileArtifacts) {
      const displayPath = artifact.path?.startsWith(root) ? artifact.path.slice(root.length + 1) : artifact.path
      lines.push(`  ${pc.green('✔')} ${displayPath}`)
    }
  }

  // Documents — the artifacts the SDLC stages produced, with their paths so
  // the developer knows exactly where each one lives.
  if (ctx.docFiles.length > 0) {
    lines.push('')
    lines.push(pc.bold('Documents'))
    for (const doc of ctx.docFiles) {
      lines.push(`  ${pc.green('✔')} ${doc}`)
    }
    lines.push(`  ${pc.dim('All docs:')} ${ctx.docsDir}`)
    lines.push(`  ${pc.dim('Preview:')} ${ctx.docFiles.length > 0 ? `open ${ctx.docsDir}${'/index.md'}` : ''}`)
  }

  // Commands that actually ran, failed ones flagged.
  if (ctx.commands.length > 0) {
    lines.push('')
    const failed = ctx.commands.filter(c => !c.success)
    lines.push(pc.bold(`Commands run (${ctx.commands.length})${failed.length ? ` — ${failed.length} failed` : ''}`))
    for (const c of ctx.commands) {
      const mark = c.success ? pc.dim('✓') : pc.red('✖')
      const dur = c.durationMs !== undefined ? pc.dim(` (${Math.round(c.durationMs / 1000)}s)`) : ''
      const exit = c.exitCode !== undefined && !c.success ? pc.red(` exit ${c.exitCode}`) : ''
      lines.push(`  ${mark} ${c.command}${dur}${exit}`)
    }
  }

  // Context block — model, intent, skills the model actually received.
  lines.push('')
  lines.push(pc.bold('Context'))
  lines.push(`  ${pc.dim('Model:')}  ${ctx.model}`)
  if (ctx.intentLabel) {
    lines.push(`  ${pc.dim('Intent:')} ${ctx.intentLabel}`)
  }
  const skillsText =
    ctx.skills.length > 0
      ? `${ctx.skills.length} inlined (${ctx.skills.slice(0, 6).join(', ')}${ctx.skills.length > 6 ? ', …' : ''})`
      : 'none'
  lines.push(`  ${pc.dim('Skills:')} ${skillsText}`)
  if (ctx.logFile) {
    lines.push(`  ${pc.dim('Log:')}    ${ctx.logFile}`)
  }
  lines.push(`  ${pc.dim('Resume:')} ${pc.cyan(`vectalon feature --resume ${result.id}`)}`)

  return lines.join('\n')
}

/** Live breadcrumb line for a completed stage, e.g. `✓ [5/13] Task creation (2.1s)`. */
export function renderStageLine(phase: PhaseResult, index: number, total: number): string {
  const mark = stageMark(phase.status)
  const num = pc.dim(`[${index + 1}/${total}]`)
  const duration = formatDuration(phase.startedAt, phase.completedAt)
  const dur = duration ? pc.dim(` (${duration})`) : ''
  return `  ${mark} ${num} ${phase.name}${dur}`
}

// ── doctor failure card ────────────────────────────────────────────────────

/** One missing check, pre-resolved into a fix the user can run or auto-apply. */
export interface DoctorCardItem {
  id: string
  name: string
  category: string
  detail: string
  /** The command to run (e.g. `npm install -D zustand`) or a manual instruction. */
  fixLabel?: string
  /** True when the fix can't be safely auto-installed (GUI / system-wide). */
  manual?: boolean
}

/**
 * Structured failure card for `vectalon doctor` — the same treatment the
 * workflow failure card got. Parses the missing checks into a numbered fix
 * list with auto/manual tags, an auto-fix count, and a pointer to the rotating
 * command log. Plain aligned rows (never a boxed table that truncates).
 */
export function renderDoctorCard(opts: {
  missing: DoctorCardItem[]
  warnings: number
  okCount: number
  autoCount: number
  logFile?: string | null
}): string {
  const lines: string[] = []
  const total = opts.missing.length

  lines.push(
    pc.red(`✖ ${total} check(s) missing`) +
      (opts.warnings > 0 ? pc.yellow(` · ${opts.warnings} warning(s)`) : '') +
      (opts.okCount > 0 ? pc.dim(` · ${opts.okCount} ok`) : '')
  )
  lines.push('')

  if (total > 0) {
    lines.push(pc.bold(`Fix steps (${total}) — ${opts.autoCount} auto-fixable with \`vectalon doctor --fix\`:`))
    lines.push('')
    const nameWidth = Math.max(...opts.missing.map(m => m.name.length), 1)
    opts.missing.forEach((item, i) => {
      const kind = item.manual ? pc.yellow('manual') : pc.green('auto')
      const label = item.fixLabel || item.detail
      lines.push(`  ${String(i + 1).padStart(2)}. [${kind}] ${pc.bold(pad(item.name, nameWidth))}  ${pc.dim(label)}`)
    })
    lines.push('')
    if (opts.autoCount > 0) {
      lines.push(`Run \`vectalon doctor --fix\` to auto-apply ${opts.autoCount} of the steps above, or use \`vectalon ecosystem --enable <id>\` to opt in per item.`)
    } else {
      lines.push('These are manual steps — follow each command, then re-run `vectalon doctor`.')
    }
  }

  lines.push('')
  lines.push(pc.bold('Where to look next'))
  if (opts.logFile) {
    lines.push(`  ${pc.dim('Log:')}    ${opts.logFile}`)
  }
  lines.push(`  ${pc.dim('Re-run:')} vectalon doctor`)
  return lines.join('\n')
}
