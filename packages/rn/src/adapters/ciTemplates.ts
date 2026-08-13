import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { detectValidationCommands } from '../utils/validationCommands'
import { logger } from '../cli/logger'
import { reportError } from '../utils/safe'

export interface CiTemplateOptions {
  /** Expo projects get `.eas/workflows/`; bare RN CLI gets `.github/workflows/`. */
  isExpo: boolean
}

export interface GeneratedCiFile {
  /** Relative path from the project root (e.g. `.github/workflows/vectalon-ci.yml`). */
  path: string
  /** True when the file was written; false when it already existed (never overwrites). */
  written: boolean
}

const EAS_WORKFLOW_PATH = join('.eas', 'workflows', 'vectalon.yml')
const GH_ACTIONS_PATH = join('.github', 'workflows', 'vectalon-ci.yml')

/**
 * Ensure the project has a CI workflow for the vectalon-generated branch:
 * EAS Workflows for Expo projects, GitHub Actions for bare RN CLI projects.
 * Idempotent — an existing workflow is never overwritten. Returns the files
 * that were actually written so callers can include them in a commit.
 */
export function ensureCiConfigs(root: string, options: CiTemplateOptions): GeneratedCiFile[] {
  if (options.isExpo) {
    return [writeIfMissing(root, EAS_WORKFLOW_PATH, generateEasWorkflow(root))]
  }
  return [writeIfMissing(root, GH_ACTIONS_PATH, generateGithubActionsWorkflow(root))]
}

function writeIfMissing(root: string, relPath: string, content: string): GeneratedCiFile {
  const fullPath = join(root, relPath)
  if (existsSync(fullPath)) {
    return { path: relPath, written: false }
  }
  try {
    mkdirSync(dirname(fullPath), { recursive: true })
    writeFileSync(fullPath, content, 'utf-8')
    logger.info(`Generated CI workflow: ${relPath}`)
    return { path: relPath, written: true }
  } catch (err) {
    logger.warn(`Could not write ${relPath}: ${err instanceof Error ? err.message : String(err)}`)
    return { path: relPath, written: false }
  }
}

function detectPackageManager(root: string): 'npm' | 'yarn' | 'pnpm' {
  if (existsSync(join(root, 'pnpm-lock.yaml'))) return 'pnpm'
  if (existsSync(join(root, 'yarn.lock'))) return 'yarn'
  return 'npm'
}

function installCommand(pm: 'npm' | 'yarn' | 'pnpm'): string {
  if (pm === 'yarn') return 'yarn install --immutable'
  if (pm === 'pnpm') return 'pnpm install --frozen-lockfile'
  return 'npm ci'
}

/** Yarn 2+/pnpm are distributed via corepack; enable it before install so setup-node's `cache:` finds the right manager. */
function managerSetup(pm: 'npm' | 'yarn' | 'pnpm'): string[] {
  return pm === 'npm' ? [] : ['- run: corepack enable']
}

function readScripts(root: string): Record<string, string> {
  try {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8')) as { scripts?: Record<string, string> }
    return pkg.scripts || {}
  } catch (err) {
    reportError(err, 'ciTemplates: reading package.json scripts')
    return {}
  }
}

function scriptRun(pm: 'npm' | 'yarn' | 'pnpm', script: string): string {
  if (pm === 'yarn') return `yarn ${script}`
  if (pm === 'pnpm') return `pnpm run ${script}`
  return `npm run ${script}`
}

/**
 * The visual regression job: boot an iOS simulator on macOS, run the vectalon
 * PR-mode runner against the PR base's committed baselines, upload the
 * artifacts, and post the report as a PR comment. Ships advisory-first
 * (continue-on-error) so a fresh project with no baselines never blocks a PR;
 * flip the job to a required check once baselines are adopted.
 */
function visualJobLines(pm: 'npm' | 'yarn' | 'pnpm'): string[] {
  return [
    '  visual:',
    '    name: Visual regression (iOS)',
    '    runs-on: macos-latest',
    '    needs: quality',
    '    if: github.event_name == \'pull_request\'',
    '    continue-on-error: true',
    '    steps:',
    '      - uses: actions/checkout@v4',
    '        with:',
    '          fetch-depth: 0',
    '      - uses: actions/setup-node@v4',
    '        with:',
    '          node-version: 20',
    `          cache: ${pm}`,
    ...managerSetup(pm).map(s => `      ${s}`),
    `      - run: ${installCommand(pm)}`,
    '      - run: npx vectalon@latest visual-ci --pr ${{ github.event.pull_request.number }} --base ${{ github.event.pull_request.base.sha }} --platform ios --push',
    '        env:',
    '          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}',
    '      - uses: actions/upload-artifact@v4',
    '        with:',
    '          name: visual-ci',
    '          path: .vectalon/visual-ci/',
    '        if: always()',
    '',
  ]
}

/**
 * GitHub Actions workflow for a bare RN CLI project. Steps come from the
 * project's actual scripts (test/lint/typecheck/prettier) plus the detected
 * native build commands — so the workflow matches what `vectalon` verifies.
 */
export function generateGithubActionsWorkflow(root: string): string {
  const pm = detectPackageManager(root)
  const scripts = readScripts(root)
  const detected = detectValidationCommands(root)

  const steps: string[] = [
    '- uses: actions/checkout@v4',
    '- uses: actions/setup-node@v4',
    '  with:',
    '    node-version: 20',
    `    cache: ${pm}`,
    ...managerSetup(pm),
    `- run: ${installCommand(pm)}`,
  ]

  const qualityScripts: Array<[string, string]> = []
  if (scripts.lint) qualityScripts.push(['lint', scriptRun(pm, 'lint')])
  if (scripts.typecheck || scripts['type-check']) qualityScripts.push(['typecheck', scriptRun(pm, scripts.typecheck ? 'typecheck' : 'type-check')])
  if (scripts['prettier:check'] || scripts['format:check']) qualityScripts.push(['format', scriptRun(pm, scripts['prettier:check'] ? 'prettier:check' : 'format:check')])
  if (scripts.test || scripts.jest) qualityScripts.push(['test', scriptRun(pm, scripts.test ? 'test' : 'jest')])

  if (qualityScripts.length > 0) {
    for (const [, command] of qualityScripts) {
      steps.push(`- run: ${command}`)
    }
  }

  // Native verification commands (pod install, gradle) — surfaced as a second
  // job when detected so the primary quality job stays fast.
  const native = detected.commands.filter(c => c.name !== 'iOS build' && c.name !== 'Android build')
  if (native.length > 0) {
    const nativeSteps = [
      '- uses: actions/checkout@v4',
      '- uses: actions/setup-node@v4',
      '  with:',
      '    node-version: 20',
      `    cache: ${pm}`,
      ...managerSetup(pm),
      `- run: ${installCommand(pm)}`,
      ...native.map(c => `- run: ${c.cmd} ${c.args.join(' ')}`),
    ]
    return [
      'name: vectalon-ci',
      '',
      'on:',
      '  pull_request:',
      '    branches:',
      '      - \'*\'',
      '',
      'jobs:',
      '  quality:',
      '    name: Lint, typecheck, and test',
      '    runs-on: ubuntu-latest',
      '    steps:',
      ...steps.map(s => `      ${s}`),
      '',
      '  native:',
      '    name: Native checks (pod install, gradle)',
      '    runs-on: macos-latest',
      '    steps:',
      ...nativeSteps.map(s => `      ${s}`),
      '',
      ...visualJobLines(pm),
    ].join('\n')
  }

  return [
    'name: vectalon-ci',
    '',
    'on:',
    '  pull_request:',
    '    branches:',
    "      - '*'",
    '',
    'jobs:',
    '  quality:',
    '    name: Lint, typecheck, and test',
    '    runs-on: ubuntu-latest',
    '    steps:',
    ...steps.map(s => `      ${s}`),
    '',
    ...visualJobLines(pm),
  ].join('\n')
}

/**
 * EAS Workflows workflow for an Expo project (`.eas/workflows/*.yml`). Runs the
 * project's quality scripts on every pull request. EAS pre-checks out the
 * pushed commit, so steps are plain `run:` commands.
 */
export function generateEasWorkflow(root: string): string {
  const pm = detectPackageManager(root)
  const scripts = readScripts(root)

  const steps: string[] = [`- run: ${installCommand(pm)}`]
  if (scripts.lint) steps.push(`- run: ${scriptRun(pm, 'lint')}`)
  if (scripts.typecheck || scripts['type-check']) steps.push(`- run: ${scriptRun(pm, scripts.typecheck ? 'typecheck' : 'type-check')}`)
  if (scripts['prettier:check'] || scripts['format:check']) steps.push(`- run: ${scriptRun(pm, scripts['prettier:check'] ? 'prettier:check' : 'format:check')}`)
  if (scripts.test || scripts.jest) steps.push(`- run: ${scriptRun(pm, scripts.test ? 'test' : 'jest')}`)

  return [
    'name: vectalon-ci',
    '',
    'on:',
    '  pull_request:',
    '    branches:',
    "      - '*'",
    '',
    'jobs:',
    '  quality:',
    '    name: Lint, typecheck, and test',
    '    steps:',
    ...steps.map(s => `      ${s}`),
    '',
  ].join('\n')
}
