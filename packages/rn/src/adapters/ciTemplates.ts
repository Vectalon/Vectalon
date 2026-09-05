import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { detectValidationCommands } from '../utils/validationCommands'
import { logger } from '../cli/logger'
import { reportError } from '../utils/safe'

/** CI hosts we can generate a native workflow for. */
export type CiProvider = 'github' | 'azure' | 'gitlab' | 'bitbucket'

export interface CiTemplateOptions {
  /** Expo projects get `.eas/workflows/`; bare RN CLI gets a provider-native workflow. */
  isExpo: boolean
  /** CI host to target. Defaults to detection from the git remote (github fallback). */
  provider?: CiProvider
  /**
   * Add the Archive & Share job to the generated workflow: build + archive
   * the default flavor (`vectalon archive`), distribute the latest build to
   * the SaaS portal when `VECTALON_API_KEY` is set, and upload
   * `.vectalon/builds/` as an artifact. GitHub Actions and EAS Workflows
   * support it; other providers ignore it (documented in the template).
   */
  withArchive?: boolean
}

export interface GeneratedCiFile {
  /** Relative path from the project root (e.g. `.github/workflows/vectalon-ci.yml`). */
  path: string
  /** True when the file was written; false when it already existed (never overwrites). */
  written: boolean
}

const EAS_WORKFLOW_PATH = join('.eas', 'workflows', 'vectalon.yml')
const GH_ACTIONS_PATH = join('.github', 'workflows', 'vectalon-ci.yml')
const AZURE_PIPELINES_PATH = join('azure-pipelines.yml')
const GITLAB_CI_PATH = join('.gitlab-ci.yml')
const BITBUCKET_PIPELINES_PATH = join('bitbucket-pipelines.yml')

export const PROVIDER_PATHS: Record<CiProvider, string> = {
  github: GH_ACTIONS_PATH,
  azure: AZURE_PIPELINES_PATH,
  gitlab: GITLAB_CI_PATH,
  bitbucket: BITBUCKET_PIPELINES_PATH,
}

/**
 * Detect the CI host from provider-specific environment variables — the path
 * that works inside a CI run where the checkout may have no git remote at all
 * (Azure Pipelines and Bitbucket checkouts are remote-less by default). Only
 * unambiguous provider markers are used; returns null when nothing matches.
 */
export function detectCiProviderFromEnv(): CiProvider | null {
  if (process.env.SYSTEM_TEAMPROJECT) return 'azure'
  if (process.env.GITLAB_CI) return 'gitlab'
  if (process.env.BITBUCKET_PIPELINES) return 'bitbucket'
  if (process.env.GITHUB_ACTIONS) return 'github'
  return null
}

/**
 * Detect the CI host from the git remote (`.git/config`), falling back to the
 * provider environment variables when the checkout has no remote (CI clones).
 * Everything unrecognized falls back to GitHub Actions — the most common
 * default for public repos and the safest template.
 */
export function detectCiProvider(root: string): CiProvider {
  try {
    const config = readFileSync(join(root, '.git', 'config'), 'utf-8')
    const urls = (config.match(/url\s*=\s*(.+)/g) || []).map(m => m.toLowerCase())
    const all = urls.join(' ')
    if (/dev\.azure\.com|visualstudio\.com|ssh\.dev\.azure/.test(all)) return 'azure'
    if (/gitlab\.(com|org)/.test(all)) return 'gitlab'
    if (/bitbucket\.org/.test(all)) return 'bitbucket'
    if (/github\.com/.test(all)) return 'github'
  } catch (err) {
    reportError(err, 'ciTemplates: reading .git/config')
  }
  return detectCiProviderFromEnv() ?? 'github'
}

/**
 * Ensure the project has a CI workflow for the vectalon-generated branch:
 * EAS Workflows for Expo projects; GitHub Actions / Azure Pipelines / GitLab
 * CI / Bitbucket Pipelines for bare RN CLI projects (detected from the git
 * remote unless a provider is given). Idempotent — an existing workflow is
 * never overwritten. Returns the files that were actually written so callers
 * can include them in a commit.
 */
export function ensureCiConfigs(root: string, options: CiTemplateOptions): GeneratedCiFile[] {
  if (options.isExpo) {
    return [writeIfMissing(root, EAS_WORKFLOW_PATH, generateEasWorkflow(root, options.withArchive))]
  }
  const provider = options.provider ?? detectCiProvider(root)
  switch (provider) {
    case 'azure':
      return [writeIfMissing(root, AZURE_PIPELINES_PATH, generateAzurePipeline(root))]
    case 'gitlab':
      return [writeIfMissing(root, GITLAB_CI_PATH, generateGitlabCi(root))]
    case 'bitbucket':
      return [writeIfMissing(root, BITBUCKET_PIPELINES_PATH, generateBitbucketPipelines(root))]
    case 'github':
      return [writeIfMissing(root, GH_ACTIONS_PATH, generateGithubActionsWorkflow(root, options.withArchive))]
  }
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
 * Failure hook for a job: when any step in the job fails, file a triaged CI
 * incident (severity, cause bucket, rollback suggestion) into the knowledge
 * base via `vectalon ci-incident` — every CI failure becomes an incident the
 * team brain learns from. Requires a git checkout (always true here) and a
 * Pro license; the step is advisory (`if: failure()` only fires on failure).
 */
function ciIncidentStepLines(gate: string): string[] {
  const sha = '${{ github.sha }}'
  const branch = '${{ github.head_ref || github.ref_name }}'
  return [
    '- name: File CI incident',
    '  if: failure()',
    `  run: npx --yes --package=@vectalon-dev/rn@latest -- vectalon ci-incident --gate ${gate} --commit ${sha} --branch ${branch}`,
  ]
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
    '      - run: npx --yes --package=@vectalon-dev/rn@latest -- vectalon visual-ci --pr ${{ github.event.pull_request.number }} --base ${{ github.event.pull_request.base.sha }} --platform ios --push',
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
 * Archive & Share job (CI/CD integration, design doc §7): on a push to main,
 * build + archive the configured flavor, distribute the latest build to the
 * SaaS portal when `VECTALON_API_KEY` is set, and upload `.vectalon/builds/`
 * as an artifact so anyone can grab the binary from the workflow run.
 */
function archiveJobLines(pm: 'npm' | 'yarn' | 'pnpm'): string[] {
  return [
    '  archive:',
    '    name: Build, archive, and distribute',
    '    runs-on: macos-latest',
    '    needs: quality',
    "    if: github.event_name == 'push' && github.ref == 'refs/heads/main'",
    '    env:',
    "      VECTALON_BUILD_FLAVOR: ${{ vars.VECTALON_BUILD_FLAVOR || 'production' }}",
    '    steps:',
    '      - uses: actions/checkout@v4',
    '      - uses: actions/setup-node@v4',
    '        with:',
    '          node-version: 20',
    `          cache: ${pm}`,
    ...managerSetup(pm).map(s => `      ${s}`),
    `      - run: ${installCommand(pm)}`,
    '      - name: Archive the build',
    '        run: npx --yes --package=@vectalon-dev/rn@latest -- vectalon archive --flavor "$VECTALON_BUILD_FLAVOR"',
    '      - name: Distribute the latest build to the SaaS portal',
    "        if: secrets.VECTALON_API_KEY != ''",
    '        run: npx --yes --package=@vectalon-dev/rn@latest -- vectalon distribute --latest --target saas',
    '        env:',
    '          VECTALON_API_KEY: ${{ secrets.VECTALON_API_KEY }}',
    '      - uses: actions/upload-artifact@v4',
    '        with:',
    '          name: vectalon-builds',
    '          path: .vectalon/builds/',
    '        if: always()',
    '',
  ]
}

/**
 * GitHub Actions workflow for a bare RN CLI project. Steps come from the
 * project's actual scripts (test/lint/typecheck/prettier) plus the detected
 * native build commands — so the workflow matches what `vectalon` verifies.
 */
export function generateGithubActionsWorkflow(root: string, withArchive?: boolean): string {
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
      ...ciIncidentStepLines('quality').map(s => `      ${s}`),
      '',
      '  native:',
      '    name: Native checks (pod install, gradle)',
      '    runs-on: macos-latest',
      '    steps:',
      ...nativeSteps.map(s => `      ${s}`),
      ...ciIncidentStepLines('native').map(s => `      ${s}`),
      '',
      ...visualJobLines(pm),
      ...(withArchive ? archiveJobLines(pm) : []),
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
    ...ciIncidentStepLines('quality').map(s => `      ${s}`),
    '',
    ...visualJobLines(pm),
    ...(withArchive ? archiveJobLines(pm) : []),
  ].join('\n')
}

/**
 * Azure Pipelines workflow for a bare RN CLI project (`azure-pipelines.yml`).
 * The mirror of the GitHub Actions workflow: same quality/native/visual jobs
 * and the same ci-incident hook (`condition: failed()`), using Azure's
 * `$(System.PullRequest.*)` / `$(Build.SourceVersion)` variables and
 * `NodeTool@0` instead of `setup-node`. The visual job posts its report as a
 * PR thread via `visual-ci --pr` using the pipeline's OAuth token, and
 * publishes the artifacts.
 */
export function generateAzurePipeline(root: string): string {
  const pm = detectPackageManager(root)
  const scripts = readScripts(root)
  const detected = detectValidationCommands(root)

  const qualityScripts: Array<[string, string]> = []
  if (scripts.lint) qualityScripts.push(['lint', scriptRun(pm, 'lint')])
  if (scripts.typecheck || scripts['type-check']) qualityScripts.push(['typecheck', scriptRun(pm, scripts.typecheck ? 'typecheck' : 'type-check')])
  if (scripts['prettier:check'] || scripts['format:check']) qualityScripts.push(['format', scriptRun(pm, scripts['prettier:check'] ? 'prettier:check' : 'format:check')])
  if (scripts.test || scripts.jest) qualityScripts.push(['test', scriptRun(pm, scripts.test ? 'test' : 'jest')])

  const nodeSetup = ['- task: NodeTool@0', '  inputs:', "    versionSpec: '20'"]
  const install = `- script: ${installCommand(pm)}`

  const qualitySteps: string[] = [
    '- checkout: self',
    '  fetchDepth: 0',
    ...nodeSetup,
    install,
    ...qualityScripts.map(([, command]) => `- script: ${command}`),
    `- script: npx --yes --package=@vectalon-dev/rn@latest -- vectalon ci-incident --gate quality --commit $(Build.SourceVersion) --branch $(System.PullRequest.SourceBranch)`,
    '  condition: failed()',
  ]

  const native = detected.commands.filter(c => c.name !== 'iOS build' && c.name !== 'Android build')
  const jobs: string[] = [
    'trigger: none',
    '',
    'pr:',
    '  branches:',
    '    include:',
    "      - '*'",
    '',
    'jobs:',
    '  - job: quality',
    '    displayName: Lint, typecheck, and test',
    '    pool:',
    '      vmImage: ubuntu-latest',
    '    steps:',
    ...qualitySteps.map(s => `      ${s}`),
    '',
  ]

  if (native.length > 0) {
    const nativeSteps: string[] = [
      '- checkout: self',
      '  fetchDepth: 0',
      ...nodeSetup,
      install,
      ...native.map(c => `- script: ${c.cmd} ${c.args.join(' ')}`),
      `- script: npx --yes --package=@vectalon-dev/rn@latest -- vectalon ci-incident --gate native --commit $(Build.SourceVersion) --branch $(System.PullRequest.SourceBranch)`,
      '  condition: failed()',
    ]
    jobs.push(
      '  - job: native',
      '    displayName: Native checks (pod install, gradle)',
      '    pool:',
      '      vmImage: macos-latest',
      '    steps:',
      ...nativeSteps.map(s => `      ${s}`),
      ''
    )
  }

  jobs.push(
    '  - job: visual',
    '    displayName: Visual regression (iOS)',
    '    dependsOn: quality',
    '    continueOnError: true',
    '    pool:',
    '      vmImage: macos-latest',
    '    steps:',
    '      - checkout: self',
    '        fetchDepth: 0',
    ...nodeSetup.map(s => `      ${s}`),
    `      - script: ${installCommand(pm)}`,
    '      - script: npx --yes --package=@vectalon-dev/rn@latest -- vectalon visual-ci --pr $(System.PullRequest.PullRequestId) --base $(System.PullRequest.TargetBranch) --platform ios --push',
    '        env:',
    '          AZURE_DEVOPS_TOKEN: $(System.AccessToken)',
    '      - publish: .vectalon/visual-ci',
    '        artifact: visual-ci',
    '        condition: always()',
    ''
  )

  return jobs.join('\n')
}

/**
 * GitLab CI workflow for a bare RN CLI project (`.gitlab-ci.yml`). GitLab has
 * no per-step failure hook, so the ci-incident step is a dedicated `report`
 * job with `when: on_failure` scoped to the quality job via `needs`. The
 * visual job requires a tagged macOS runner (GitLab.com shared runners are
 * Linux-only), is advisory (`allow_failure`), and posts its report as an MR
 * note via `visual-ci --pr` with `GITLAB_TOKEN`.
 */
export function generateGitlabCi(root: string): string {
  const pm = detectPackageManager(root)
  const scripts = readScripts(root)
  const detected = detectValidationCommands(root)

  const qualityScripts: Array<[string, string]> = []
  if (scripts.lint) qualityScripts.push(['lint', scriptRun(pm, 'lint')])
  if (scripts.typecheck || scripts['type-check']) qualityScripts.push(['typecheck', scriptRun(pm, scripts.typecheck ? 'typecheck' : 'type-check')])
  if (scripts['prettier:check'] || scripts['format:check']) qualityScripts.push(['format', scriptRun(pm, scripts['prettier:check'] ? 'prettier:check' : 'format:check')])
  if (scripts.test || scripts.jest) qualityScripts.push(['test', scriptRun(pm, scripts.test ? 'test' : 'jest')])

  const native = detected.commands.filter(c => c.name !== 'iOS build' && c.name !== 'Android build')
  const install = installCommand(pm)

  const lines: string[] = [
    'stages:',
    '  - quality',
    '  - native',
    '  - report',
    '  - visual',
    '',
    'workflow:',
    '  rules:',
    "    - if: $CI_PIPELINE_SOURCE == 'merge_request_event'",
    '',
    'quality:',
    '  stage: quality',
    '  image: node:20',
    '  script:',
    `    - ${install}`,
    ...qualityScripts.map(([, command]) => `    - ${command}`),
    '',
  ]

  if (native.length > 0) {
    lines.push(
      'native:',
      '  stage: native',
      '  image: node:20',
      '  script:',
      `    - ${install}`,
      ...native.map(c => `    - ${c.cmd} ${c.args.join(' ')}`),
      '',
      'ci-incident:',
      '  stage: report',
      '  image: node:20',
      '  when: on_failure',
      '  needs:',
      '    - quality',
      '    - native',
      '  script:',
      '    - npx --yes --package=@vectalon-dev/rn@latest -- vectalon ci-incident --gate ci --commit $CI_COMMIT_SHA --branch $CI_MERGE_REQUEST_SOURCE_BRANCH_NAME',
      ''
    )
  } else {
    lines.push(
      'ci-incident:',
      '  stage: report',
      '  image: node:20',
      '  when: on_failure',
      '  needs:',
      '    - quality',
      '  script:',
      '    - npx --yes --package=@vectalon-dev/rn@latest -- vectalon ci-incident --gate quality --commit $CI_COMMIT_SHA --branch $CI_MERGE_REQUEST_SOURCE_BRANCH_NAME',
      ''
    )
  }

  lines.push(
    'visual:',
    '  stage: visual',
    '  image: node:20',
    '  tags:',
    '    - macos',
    '  allow_failure: true',
    '  script:',
    `    - ${install}`,
    '    - npx --yes --package=@vectalon-dev/rn@latest -- vectalon visual-ci --pr $CI_MERGE_REQUEST_IID --base $CI_MERGE_REQUEST_TARGET_BRANCH_NAME --platform ios --push',
    '    env:',
    '      GITLAB_TOKEN: $GITLAB_TOKEN',
    '  artifacts:',
    '    when: always',
    '    paths:',
    '      - .vectalon/visual-ci/',
    ''
  )

  return lines.join('\n')
}

/**
 * Bitbucket Pipelines workflow for a bare RN CLI project
 * (`bitbucket-pipelines.yml`). Bitbucket has no post-failure step hook and no
 * macOS runners, so the ci-incident and visual jobs are omitted — the pipeline
 * runs the quality and native checks on every pull request.
 */
export function generateBitbucketPipelines(root: string): string {
  const pm = detectPackageManager(root)
  const scripts = readScripts(root)
  const detected = detectValidationCommands(root)

  const qualityScripts: Array<[string, string]> = []
  if (scripts.lint) qualityScripts.push(['lint', scriptRun(pm, 'lint')])
  if (scripts.typecheck || scripts['type-check']) qualityScripts.push(['typecheck', scriptRun(pm, scripts.typecheck ? 'typecheck' : 'type-check')])
  if (scripts['prettier:check'] || scripts['format:check']) qualityScripts.push(['format', scriptRun(pm, scripts['prettier:check'] ? 'prettier:check' : 'format:check')])
  if (scripts.test || scripts.jest) qualityScripts.push(['test', scriptRun(pm, scripts.test ? 'test' : 'jest')])

  const native = detected.commands.filter(c => c.name !== 'iOS build' && c.name !== 'Android build')
  const install = installCommand(pm)

  const lines: string[] = [
    'image: node:20',
    '',
    'pipelines:',
    '  pull-requests:',
    "    '**':",
    '      - step:',
    '          name: Lint, typecheck, and test',
    '          caches:',
    '            - node',
    '          script:',
    `            - ${install}`,
    ...qualityScripts.map(([, command]) => `            - ${command}`),
  ]

  if (native.length > 0) {
    lines.push(
      '      - step:',
      '          name: Native checks (pod install, gradle)',
      '          caches:',
      '            - node',
      '          script:',
      `            - ${install}`,
      ...native.map(c => `            - ${c.cmd} ${c.args.join(' ')}`)
    )
  }

  return lines.join('\n')
}

/**
 * EAS Workflows workflow for an Expo project (`.eas/workflows/*.yml`). Runs the
 * project's quality scripts on every pull request. EAS pre-checks out the
 * pushed commit, so steps are plain `run:` commands.
 */
export function generateEasWorkflow(root: string, withArchive?: boolean): string {
  const pm = detectPackageManager(root)
  const scripts = readScripts(root)

  const steps: string[] = [`- run: ${installCommand(pm)}`]
  if (scripts.lint) steps.push(`- run: ${scriptRun(pm, 'lint')}`)
  if (scripts.typecheck || scripts['type-check']) steps.push(`- run: ${scriptRun(pm, scripts.typecheck ? 'typecheck' : 'type-check')}`)
  if (scripts['prettier:check'] || scripts['format:check']) steps.push(`- run: ${scriptRun(pm, scripts['prettier:check'] ? 'prettier:check' : 'format:check')}`)
  if (scripts.test || scripts.jest) steps.push(`- run: ${scriptRun(pm, scripts.test ? 'test' : 'jest')}`)

  const archive: string[] = withArchive
    ? [
        '',
        '  archive:',
        '    name: Build, archive, and distribute',
        "    if: ${{ github.event_name == 'push' && github.ref == 'refs/heads/main' }}",
        '    env:',
        "      VECTALON_BUILD_FLAVOR: ${{ vars.VECTALON_BUILD_FLAVOR || 'production' }}",
        '    steps:',
        `      - run: ${installCommand(pm)}`,
        '      - name: Archive the build',
        '        run: npx --yes --package=@vectalon-dev/rn@latest -- vectalon archive --flavor "$VECTALON_BUILD_FLAVOR"',
        '      - name: Distribute the latest build to the SaaS portal',
        "        if: ${{ secrets.VECTALON_API_KEY != '' }}",
        '        run: npx --yes --package=@vectalon-dev/rn@latest -- vectalon distribute --latest --target saas',
        '        env:',
        '          VECTALON_API_KEY: ${{ secrets.VECTALON_API_KEY }}',
      ]
    : []

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
    ...archive,
    '',
  ].join('\n')
}
