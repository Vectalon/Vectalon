#!/usr/bin/env node
/**
 * Regenerates apps/website/lib/reportSamples.ts from the REAL reports the
 * agents wrote into the demo project (apps/website/demo/login-app). Run this
 * after re-running any vectalon agent against the demo:
 *
 *   node scripts/sync-reports.mjs
 *
 * It reads the agent catalog (lib/agents.ts) so the sample list can never
 * drift from the shipped agent set: every catalog command must have a report
 * on disk, or the script fails loudly.
 *
 * Usage:
 *   node scripts/sync-reports.mjs [demoRoot]
 */
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const websiteRoot = resolve(here, '..')
const demoRoot = resolve(process.argv[2] ?? join(websiteRoot, 'demo', 'login-app'))
const agentsPath = join(websiteRoot, 'lib', 'agents.ts')
const outPath = join(websiteRoot, 'lib', 'reportSamples.ts')

function dirname(p) {
  return p.slice(0, p.lastIndexOf('/'))
}

// ── read the catalog: cmd → name ──────────────────────────────────────────
const agentsSrc = readFileSync(agentsPath, 'utf-8')
// Pair each `cmd:` with the `name:` that follows it inside the same agent
// object (ignores interface fields and repo objects, which also use `name:`).
const pairs = []
for (const cmdMatch of agentsSrc.matchAll(/cmd:\s*'([a-z0-9-]+)'/g)) {
  const after = agentsSrc.slice(cmdMatch.index + cmdMatch[0].length, agentsSrc.indexOf('},', cmdMatch.index))
  const nameMatch = after.match(/name:\s*'([^']+)'/)
  if (!nameMatch) {
    throw new Error(`no name found for cmd ${cmdMatch[1]}`)
  }
  pairs.push([cmdMatch[1], nameMatch[1]])
}
const cmds = pairs.map(([c]) => c)
const names = pairs.map(([, n]) => n)
if (cmds.length !== names.length || cmds.length !== 44) {
  throw new Error(`catalog parse mismatch: ${cmds.length} cmds vs ${names.length} names (expected 44)`)
}
const catalog = Object.fromEntries(pairs)

// ── regenerate hints for input-driven agents ──────────────────────────────
const REGENERATE = {
  crash: 'vectalon crash --log crash.log',
  'build-fix': 'vectalon build-fix --log metro.log',
  'test-repair': 'vectalon test-repair --log jest.log',
  incident: 'vectalon incident',
  sentry: 'vectalon telemetry --path telemetry/ && vectalon sentry',
  observability: 'vectalon telemetry --path telemetry/ && vectalon observability',
  monitor: 'vectalon telemetry --path telemetry/ && vectalon monitor',
  dashboard: 'vectalon dashboard',
  gh_pr_placeholder: '',
}
const defaultRegenerate = (cmd) => `vectalon ${cmd}`

// ── collect the reports ───────────────────────────────────────────────────
const reportRoot = join(demoRoot, 'docs', 'vectalon')
if (!existsSync(reportRoot)) {
  throw new Error(`no reports at ${reportRoot} — run the agents against the demo first`)
}
const onDisk = readdirSync(reportRoot).filter((d) => {
  try {
    return existsSync(join(reportRoot, d, 'report.md')) || existsSync(join(reportRoot, d, 'review.md'))
  } catch {
    return false
  }
})

const missing = cmds.filter((c) => !onDisk.includes(c))
if (missing.length) {
  throw new Error(`catalog commands missing a report on disk: ${missing.join(', ')}`)
}

const samples = []
for (const cmd of cmds) {
  const dir = join(reportRoot, cmd)
  const mdFile = existsSync(join(dir, 'report.md')) ? 'report.md' : 'review.md'
  const doc = readFileSync(join(dir, mdFile), 'utf-8')

  // verdict from report.json when present, else parse the markdown
  let verdict = 'needs-attention'
  const jsonPath = join(dir, 'report.json')
  if (existsSync(jsonPath)) {
    try {
      const parsed = JSON.parse(readFileSync(jsonPath, 'utf-8'))
      if (parsed && typeof parsed.verdict === 'string') verdict = parsed.verdict
    } catch {
      /* fall through to markdown parse */
    }
  }
  if (!['approved', 'needs-attention', 'changes-requested'].includes(verdict)) {
    const mdMatch = doc.match(/Verdict:\s*\*\*([a-z-]+)\*\*/i)
    if (mdMatch) verdict = mdMatch[1].toLowerCase()
    if (!['approved', 'needs-attention', 'changes-requested'].includes(verdict)) {
      throw new Error(`unknown verdict ${verdict} for ${cmd}`)
    }
  }

  samples.push({
    cmd,
    name: catalog[cmd],
    verdict,
    project: 'apps/website/demo/login-app',
    reportPath: `docs/vectalon/${cmd}/${mdFile}`,
    regenerate: REGENERATE[cmd] || defaultRegenerate(cmd),
    doc,
  })
}

// ── emit TS ───────────────────────────────────────────────────────────────
const esc = (s) => JSON.stringify(s)
const lines = []
lines.push(`/**`)
lines.push(` * GENERATED FILE — do not edit by hand.`)
lines.push(` * Regenerate with: node scripts/sync-reports.mjs`)
lines.push(` *`)
lines.push(` * The real documents vectalon writes to docs/vectalon/<cmd>/ in the demo`)
lines.push(` * project (apps/website/demo/login-app). Every one of the ${samples.length} catalog`)
lines.push(` * agents is represented, exactly as written. The completeness guard in`)
lines.push(` * __tests__/reports.test.ts fails if this list ever drifts from the catalog.`)
lines.push(` */`)
lines.push(``)
lines.push(`export interface ReportSample {`)
lines.push(`  /** CLI command that produced the report, e.g. \`crash\`. */`)
lines.push(`  cmd: string`)
lines.push(`  /** Display name (matches the agent catalog). */`)
lines.push(`  name: string`)
lines.push(`  /** The report's own verdict. */`)
lines.push(`  verdict: 'approved' | 'needs-attention' | 'changes-requested'`)
lines.push(`  /** Project the report was generated against. */`)
lines.push(`  project: string`)
lines.push(`  /** Where the report lives inside the project. */`)
lines.push(`  reportPath: string`)
lines.push(`  /** Exact command(s) that regenerate it. */`)
lines.push(`  regenerate: string`)
lines.push(`  /** The full document, exactly as written. */`)
lines.push(`  doc: string`)
lines.push(`}`)
lines.push(``)
lines.push(`export const REPORT_SAMPLES: ReportSample[] = [`)
for (const s of samples) {
  lines.push(`  {`)
  lines.push(`    cmd: ${esc(s.cmd)},`)
  lines.push(`    name: ${esc(s.name)},`)
  lines.push(`    verdict: ${esc(s.verdict)},`)
  lines.push(`    project: ${esc(s.project)},`)
  lines.push(`    reportPath: ${esc(s.reportPath)},`)
  lines.push(`    regenerate: ${esc(s.regenerate)},`)
  lines.push(`    doc: ${esc(s.doc)},`)
  lines.push(`  },`)
}
lines.push(`]`)
lines.push(``)
writeFileSync(outPath, lines.join('\n'))

console.log(`wrote ${samples.length} report samples → ${outPath}`)
console.log(`verdicts: ${samples.filter((s) => s.verdict === 'approved').length} approved · ${samples.filter((s) => s.verdict === 'needs-attention').length} needs-attention · ${samples.filter((s) => s.verdict === 'changes-requested').length} changes-requested`)
