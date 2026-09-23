import { spawn } from 'child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, join, resolve } from 'path'
import { runSmoke, cliEntry, detectFlavor, detectSourceFiles, emptyTotals } from './runner'
import type { SmokeReport, SmokeTotals } from './types'

export interface DemoApp {
  id: string
  name: string
  description: string
  dependencies: Record<string, string>
  files?: Record<string, string>
}

export interface ModelEvidence {
  provider: string
  inference: 'pass' | 'fail'
  guardrails: number | null
  adherence: number | null
  verdict: 'pass' | 'fail'
  output: string
  benchmarkPath?: string
}

export interface MatrixAppRun {
  app: DemoApp
  root: string
  report: SmokeReport
}

export interface MatrixReport {
  generatedAt: string
  durationMs: number
  totals: SmokeTotals
  apps: MatrixAppRun[]
  model: ModelEvidence | null
}

export interface MatrixOptions {
  root: string
  outDir: string
  apps?: string[]
  only?: string[]
  skip?: string[]
  full?: boolean
  timeoutMs?: number
  model?: string
  onRun?: (app: DemoApp, completed: number, total: number) => void
}

const app = (id: string, name: string, description: string, dependencies: Record<string, string>, files?: Record<string, string>): DemoApp => ({
  id, name, description, dependencies, files,
})

/** Ten intentionally different RN/Expo shapes; generated on demand, never installed. */
export const DEMO_APPS: DemoApp[] = [
  app('expo-router', 'Expo Router SaaS', 'Expo SDK 53, file routing, secure storage', { expo: '~53.0.0', 'expo-router': '~5.0.0', 'expo-secure-store': '~14.2.0', react: '19.0.0', 'react-native': '0.79.0' }, { 'app.json': '{"expo":{"name":"Router SaaS","plugins":["expo-router"]}}\n' }),
  app('expo-dev-client', 'Expo Dev Client', 'Expo SDK 52, Reanimated, gestures', { expo: '~52.0.0', 'expo-dev-client': '~5.0.0', 'react-native-reanimated': '~3.16.0', 'react-native-gesture-handler': '~2.20.0', react: '18.3.1', 'react-native': '0.76.0' }),
  app('bare-new-arch', 'Bare New Architecture', 'RN 0.79, Hermes, Fabric/TurboModules', { react: '19.0.0', 'react-native': '0.79.0', '@react-navigation/native': '^7.0.0' }, { 'android/gradle.properties': 'newArchEnabled=true\nhermesEnabled=true\n' }),
  app('bare-legacy', 'Bare Legacy Migration', 'RN 0.74, old architecture migration target', { react: '18.2.0', 'react-native': '0.74.5', 'react-native-device-info': '^11.1.0' }, { 'android/gradle.properties': 'newArchEnabled=false\nhermesEnabled=true\n' }),
  app('monorepo-mobile', 'Monorepo Mobile', 'RN workspace consuming shared UI and API packages', { react: '18.3.1', 'react-native': '0.76.5', '@vectalon-demo/ui': 'workspace:*' }, { 'pnpm-workspace.yaml': 'packages:\n  - packages/*\n', 'packages/ui/package.json': '{"name":"@vectalon-demo/ui","version":"1.0.0"}\n' }),
  app('expo-observed', 'Observed Expo App', 'Expo with Sentry and Firebase telemetry', { expo: '~53.0.0', '@sentry/react-native': '^6.0.0', '@react-native-firebase/app': '^21.0.0', react: '19.0.0', 'react-native': '0.79.0' }),
  app('bare-commerce', 'Bare Commerce App', 'Redux Toolkit, React Query, payments', { react: '18.3.1', 'react-native': '0.76.5', '@reduxjs/toolkit': '^2.3.0', '@tanstack/react-query': '^5.60.0', '@stripe/stripe-react-native': '^0.39.0' }),
  app('expo-accessible', 'Accessible Expo App', 'NativeWind and accessibility-heavy UI', { expo: '~53.0.0', nativewind: '^4.1.0', 'expo-font': '~13.3.0', react: '19.0.0', 'react-native': '0.79.0' }),
  app('bare-native-modules', 'Native Modules App', 'Maps, camera, permissions, native builds', { react: '18.3.1', 'react-native': '0.76.5', 'react-native-maps': '^1.20.0', 'react-native-vision-camera': '^4.6.0', 'react-native-permissions': '^5.2.0' }),
  app('expo-offline', 'Offline-first Expo App', 'SQLite, NetInfo, background sync', { expo: '~53.0.0', 'expo-sqlite': '~15.2.0', '@react-native-community/netinfo': '^11.4.0', 'expo-background-task': '~1.0.0', react: '19.0.0', 'react-native': '0.79.0' }),
]

function write(root: string, relative: string, content: string): void {
  const path = join(root, relative)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content)
}

export function materializeDemoApp(baseDir: string, definition: DemoApp): string {
  const root = join(baseDir, definition.id)
  mkdirSync(root, { recursive: true })
  write(root, 'package.json', JSON.stringify({
    name: `vectalon-demo-${definition.id}`,
    version: '1.0.0',
    private: true,
    scripts: { test: 'jest', lint: 'eslint .', typecheck: 'tsc --noEmit' },
    dependencies: definition.dependencies,
    devDependencies: { typescript: '^5.7.0', jest: '^29.7.0', eslint: '^8.57.0' },
  }, null, 2) + '\n')
  write(root, 'App.tsx', `import React from 'react'\nimport { SafeAreaView, Text } from 'react-native'\n\nexport default function App() {\n  return <SafeAreaView accessibilityLabel="${definition.name}"><Text>${definition.name}</Text></SafeAreaView>\n}\n`)
  write(root, 'tsconfig.json', '{"compilerOptions":{"jsx":"react-jsx","strict":true},"include":["App.tsx","src"]}\n')
  write(root, '.vectalon/policy.json', JSON.stringify({ version: 1, rules: {}, customRules: [{ id: 'demo-no-eval', name: 'No eval', description: 'Demo apps forbid eval', severity: 'error', pattern: '\\beval\\s*\\(' }] }, null, 2) + '\n')
  write(root, '.vectalon/evals/cases.json', JSON.stringify({ cases: [{ id: 'safe-code', input: 'Generate a component', expected: 'eval(', actual: 'No eval() used', mode: 'includes' }] }, null, 2) + '\n')
  for (const [relative, content] of Object.entries(definition.files || {})) write(root, relative, content)
  return root
}

function addTotals(target: SmokeTotals, source: SmokeTotals): void {
  for (const key of ['pass', 'warn', 'skip', 'fail', 'timeout', 'total'] as const) target[key] += source[key]
}

function runCli(bin: string, args: string[], cwd: string, timeoutMs = 30 * 60_000): Promise<{ code: number | null; output: string }> {
  return new Promise(resolvePromise => {
    const child = spawn(process.execPath, [bin, ...args], { cwd, env: { ...process.env, FORCE_COLOR: '0' }, stdio: ['ignore', 'pipe', 'pipe'], shell: false })
    let output = ''
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs)
    child.stdout.on('data', (chunk: Buffer) => { output += chunk.toString() })
    child.stderr.on('data', (chunk: Buffer) => { output += chunk.toString() })
    child.on('error', error => { output += `\n${error.message}\n` })
    child.on('close', code => { clearTimeout(timer); resolvePromise({ code, output }) })
  })
}

async function collectModelEvidence(provider: string, root: string, outDir: string): Promise<ModelEvidence> {
  const bin = cliEntry()
  const inference = await runCli(bin, ['--experimental', 'selftest', root, '--only', 'model-inference', '--model', provider, '--require-model', '--json'], root)
  const benchmarkPath = join(outDir, `model-${provider}-benchmark.json`)
  const benchmark = inference.code === 0
    ? await runCli(bin, ['--experimental', 'bench', '--model', provider, '--json', '--output', benchmarkPath], root)
    : { code: 1, output: 'Benchmark skipped because real model inference failed.\n' }
  let guardrails: number | null = null
  let adherence: number | null = null
  if (benchmark.code === 0 && existsSync(benchmarkPath)) {
    const summary = JSON.parse(readFileSync(benchmarkPath, 'utf8')) as { overallGuardrails?: number | null; runs?: Array<{ axes?: { adherence?: number | null } }> }
    guardrails = summary.overallGuardrails ?? null
    const values = (summary.runs || []).map(run => run.axes?.adherence).filter((value): value is number => typeof value === 'number')
    adherence = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null
  }
  const verdict = inference.code === 0 && benchmark.code === 0 && guardrails === 1 && adherence !== null && adherence >= 0.8 ? 'pass' : 'fail'
  return {
    provider,
    inference: inference.code === 0 ? 'pass' : 'fail',
    guardrails,
    adherence,
    verdict,
    output: `${inference.output}\n${benchmark.output}`.trim(),
    benchmarkPath: existsSync(benchmarkPath) ? benchmarkPath : undefined,
  }
}

export async function runMatrix(options: MatrixOptions): Promise<MatrixReport> {
  const startedAt = Date.now()
  const selected = options.apps?.length ? DEMO_APPS.filter(item => options.apps!.includes(item.id)) : DEMO_APPS
  if (selected.length === 0) throw new Error(`No demo apps matched: ${(options.apps || []).join(', ')}`)
  const appsDir = join(options.outDir, 'apps')
  const totals = emptyTotals()
  const apps: MatrixAppRun[] = []
  for (const [index, definition] of selected.entries()) {
    const root = materializeDemoApp(appsDir, definition)
    const report = await runSmoke({ root, bin: cliEntry(), flavor: detectFlavor(root), srcFiles: detectSourceFiles(root) }, {
      only: options.only,
      skip: options.skip,
      full: options.full,
      timeoutMs: options.timeoutMs,
    })
    apps.push({ app: definition, root, report })
    addTotals(totals, report.totals)
    options.onRun?.(definition, index + 1, selected.length)
  }
  const model = options.model ? await collectModelEvidence(options.model, apps[0].root, options.outDir) : null
  return { generatedAt: new Date().toISOString(), durationMs: Date.now() - startedAt, totals, apps, model }
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export function renderMatrixLog(report: MatrixReport): string {
  const lines = [`Vectalon RN demo matrix — ${report.generatedAt}`, '']
  for (const item of report.apps) {
    lines.push(`## ${item.app.name} (${item.app.id})`, item.app.description)
    for (const run of item.report.runs) lines.push(`\n### ${run.check.id} [${run.status}]\n$ vectalon ${run.args.join(' ')}\n${run.output.trim() || '(no output)'}`)
    lines.push('')
  }
  if (report.model) lines.push(`## Model evidence (${report.model.provider})`, `verdict=${report.model.verdict} guardrails=${report.model.guardrails ?? 'n/a'} adherence=${report.model.adherence ?? 'n/a'}`, report.model.output)
  return lines.join('\n')
}

export function renderMatrixHtml(report: MatrixReport): string {
  const commands = [...new Set(report.apps.flatMap(item => item.report.runs.map(run => run.check.id)))]
  const cells = commands.map(command => `<tr><th>${escapeHtml(command)}</th>${report.apps.map(item => {
    const run = item.report.runs.find(candidate => candidate.check.id === command)
    if (!run) return '<td class="skip">—</td>'
    return `<td class="${run.status}"><details><summary>${run.status.toUpperCase()}</summary><code>vectalon ${escapeHtml(run.args.join(' '))}</code><pre>${escapeHtml(run.output.trim() || '(no output)')}</pre></details></td>`
  }).join('')}</tr>`).join('\n')
  const model = report.model ? `<section><h2>Local model evidence: <span class="${report.model.verdict}">${report.model.verdict.toUpperCase()}</span></h2><p>Real inference: ${report.model.inference} · guardrails: ${report.model.guardrails === null ? 'n/a' : `${Math.round(report.model.guardrails * 100)}%`} · adherence: ${report.model.adherence === null ? 'n/a' : `${Math.round(report.model.adherence * 100)}%`} · pass requires real output, 100% guardrails, ≥80% adherence.</p><details><summary>Model output</summary><pre>${escapeHtml(report.model.output)}</pre></details></section>` : '<section><h2>Local model evidence: NOT RUN</h2><p>Run with <code>--model local</code> to require real inference and score generated code.</p></section>'
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Vectalon RN demo matrix</title><style>body{font:14px system-ui;background:#0b1220;color:#e2e8f0;margin:24px}table{border-collapse:collapse;display:block;overflow:auto}th,td{border:1px solid #334155;padding:8px;min-width:105px;vertical-align:top}th{position:sticky;left:0;background:#111827}.pass{color:#22c55e}.warn{color:#f59e0b}.skip{color:#06b6d4}.fail,.timeout{color:#ef4444}summary{cursor:pointer;font-weight:700}pre{max-width:520px;max-height:360px;overflow:auto;white-space:pre-wrap;color:#cbd5e1}code{color:#93c5fd}</style></head><body><h1>Vectalon RN demo matrix</h1><p>${report.apps.length} apps · ${commands.length} command checks · ${report.totals.pass} pass · ${report.totals.warn} warn · ${report.totals.skip} skip · ${report.totals.fail + report.totals.timeout} fail</p>${model}<table><thead><tr><th>Command</th>${report.apps.map(item => `<th title="${escapeHtml(item.app.description)}">${escapeHtml(item.app.name)}</th>`).join('')}</tr></thead><tbody>${cells}</tbody></table></body></html>`
}

export function writeMatrixReport(report: MatrixReport, outDir: string): { json: string; log: string; html: string } {
  const resolved = resolve(outDir)
  mkdirSync(resolved, { recursive: true })
  const paths = { json: join(resolved, 'report.json'), log: join(resolved, 'report.log'), html: join(resolved, 'report.html') }
  writeFileSync(paths.json, JSON.stringify(report, null, 2))
  writeFileSync(paths.log, renderMatrixLog(report))
  writeFileSync(paths.html, renderMatrixHtml(report))
  return paths
}
