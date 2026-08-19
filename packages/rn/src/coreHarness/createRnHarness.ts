import {
  createCoreHarness,
  type EngineeringRule,
  type HarnessRun,
  type ModelProvider,
  type ProjectProfile,
} from '@vectalon-dev/core'
import type { ProjectInfo } from '../harness/types'
import type { GuardrailConventions, GuardrailFinding, GuardrailResult, GuardrailRule } from '../guardrails/types'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { createHash } from 'crypto'

const CORE_REVISION = '309707259c7c12db08c77fd3b5ebaa5a3343c2c4'
const PROFILE_SCHEMA_VERSION = '1.0.0'

interface RouterPort {
  generate(request: { prompt: string; temperature?: number }): Promise<{ content: string; provider: string }>
}

export interface RnHarnessOptions {
  projectRoot: string
  project: ProjectInfo
  rules: readonly GuardrailRule[]
  modelRouter?: RouterPort
  clock?: () => string
  conventions?: GuardrailConventions
}

export interface RnHarnessFile {
  path: string
  content: string
}

export interface RnHarnessOutcome {
  files: RnHarnessFile[]
  results: GuardrailResult[]
  run: HarnessRun
  writable: boolean
}

interface RuleRecord {
  finding?: GuardrailFinding
  skipped: boolean
}

export function discoverRnProject(projectRoot: string): ProjectInfo {
  let manifest: { name?: string; version?: string; dependencies?: Record<string, string>; devDependencies?: Record<string, string>; scripts?: Record<string, string> } = {}
  try {
    manifest = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf-8'))
  } catch {
    // Core receives a normalized partial profile for damaged projects; the RN
    // adapter remains responsible for filesystem error detail.
  }
  const dependencies = manifest.dependencies ?? {}
  const devDependencies = manifest.devDependencies ?? {}
  const expoVersion = dependencies.expo ?? devDependencies.expo ?? ''
  const platforms = ['ios', 'android'].filter(platform => existsSync(join(projectRoot, platform)))
  return {
    root: projectRoot,
    name: manifest.name ?? 'react-native-project',
    version: manifest.version ?? '0.0.0',
    reactNativeVersion: dependencies['react-native'] ?? devDependencies['react-native'] ?? '',
    dependencies,
    devDependencies,
    scripts: manifest.scripts ?? {},
    platforms,
    hasTypeScript: existsSync(join(projectRoot, 'tsconfig.json')) || Boolean(devDependencies.typescript),
    hasMetro: existsSync(join(projectRoot, 'metro.config.js')) || existsSync(join(projectRoot, 'metro.config.ts')),
    hasExpo: Boolean(expoVersion),
    tooling: expoVersion ? 'expo' : 'rn-cli',
    expoSdkVersion: expoVersion,
    reactVersion: dependencies.react ?? devDependencies.react ?? '',
  }
}

function projectProfile(project: ProjectInfo): ProjectProfile {
  return {
    name: project.name,
    version: project.version,
    language: project.hasTypeScript ? 'typescript' : 'javascript',
    framework: project.hasExpo ? 'expo' : 'react-native',
    platform: [...project.platforms].sort().join('+') || undefined,
    dependencies: { ...project.dependencies },
    devDependencies: { ...project.devDependencies },
    features: [
      project.tooling,
      ...(project.newArchitecture?.enabled ? ['new-architecture'] : []),
      ...(project.workspace?.isMonorepo ? ['monorepo'] : []),
    ],
  }
}

function engineeringRule(rule: GuardrailRule): EngineeringRule {
  return {
    id: rule.id,
    version: '1.0.0',
    name: rule.name,
    severity: rule.severity,
    category: 'correctness',
    description: rule.description,
    check: () => [],
  }
}

function modelProvider(router: RouterPort): ModelProvider {
  return {
    id: 'rn-model-router',
    name: 'Vectalon RN model router',
    capabilities: () => ({
      toolCalling: false,
      structuredOutput: false,
      vision: false,
      contextWindow: Number.MAX_SAFE_INTEGER,
      maxOutputTokens: Number.MAX_SAFE_INTEGER,
      streaming: false,
    }),
    async generate(request) {
      const response = await router.generate({
        prompt: [
          'Repair the following generated file so it passes every supplied project guardrail.',
          'Return only the complete corrected file contents, with no Markdown fence or JSON envelope.',
          '',
          request.messages.map(message => message.content).join('\n'),
        ].join('\n'),
        temperature: request.temperature,
      })
      return {
        message: { role: 'assistant', content: response.content },
        toolCalls: [],
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        stopReason: 'stop',
        model: response.provider,
      }
    },
  }
}

export function createRnHarness(options: RnHarnessOptions) {
  const activeRules = options.rules.filter(rule => rule.enabled !== false)
  const disabledCount = options.rules.length - activeRules.length
  const rulesById = new Map(activeRules.map(rule => [rule.id, rule]))
  const conventions: GuardrailConventions = {
    hasTypeScript: options.project.hasTypeScript,
    newArchitecture: options.project.newArchitecture,
    reactVersion: options.project.reactVersion,
    reactCompiler: options.project.reactCompiler,
    ...options.conventions,
  }

  return {
    async validate(files: readonly RnHarnessFile[], repair?: { maxAttempts: number }): Promise<RnHarnessOutcome> {
      const records = new Map<string, RuleRecord>()
      const profile = projectProfile(options.project)
      const providers = options.modelRouter ? [modelProvider(options.modelRouter)] : []
      const harness = createCoreHarness(
        {
          coreRevision: CORE_REVISION,
          profileSchemaVersion: PROFILE_SCHEMA_VERSION,
          providerPriority: providers.map(provider => provider.id),
        },
        {
          discovery: { discover: async () => ({ project: profile, diagnostics: [] }) },
          ruleExecution: {
            supports: rule => rulesById.has(rule.id),
            execute: async ({ rule, change }) => {
              const rnRule = rulesById.get(rule.id)
              if (!rnRule) throw new Error('Unsupported RN rule')
              const key = `${rule.id}\0${change.relativePath}`
              const context = { filePath: change.relativePath, content: change.content, conventions }
              if (rnRule.applicable && !rnRule.applicable(context)) {
                records.set(key, { skipped: true })
                return []
              }
              const checked = rnRule.check(context)
              const finding: GuardrailFinding = {
                rule: rnRule.name,
                severity: rnRule.severity,
                passed: checked.passed,
                message: checked.message,
                line: checked.line,
              }
              records.set(key, { finding, skipped: false })
              return checked.passed ? [] : [{ code: rnRule.id, severity: rnRule.severity, line: checked.line }]
            },
          },
          providers,
          clock: { now: options.clock ?? (() => new Date().toISOString()) },
        },
      )

      const run = await harness.run({
        runId: `rn-${createHash('sha256').update(files.map(file => file.path).sort().join('\0')).digest('hex').slice(0, 20)}`,
        capabilityId: repair ? 'rn.generated-file.repair' : 'rn.policy.check',
        projectLocator: options.projectRoot,
        profileInputs: [
          {
            layer: 'language',
            source: {
              id: profile.language,
              name: profile.language,
              features: {
                typing: options.project.hasTypeScript ? 'static' : 'dynamic',
                concurrency: 'event-loop',
                errorHandling: 'exceptions',
                moduleSystem: 'mixed',
              },
            },
          },
          { layer: 'system', source: { rules: activeRules.map(engineeringRule) } },
        ],
        changes: files.map((file, index) => ({ id: String(index), relativePath: file.path, content: file.content })),
        ...(repair ? { repair: { enabled: true, maxAttempts: repair.maxAttempts } } : {}),
      })

      const outputFiles = run.local.changes.map(change => ({ path: change.relativePath, content: change.content }))
      const results = outputFiles.map(file => {
        const fileRecords = activeRules.map(rule => records.get(`${rule.id}\0${file.path}`))
        const findings = fileRecords.flatMap(record => record?.finding ? [record.finding] : [])
        if (run.safe.status === 'failed' && findings.every(finding => finding.passed)) {
          findings.push({
            rule: 'Core harness execution',
            severity: 'error',
            passed: false,
            message: `Validation failed safely (${run.safe.reason})`,
          })
        }
        const skipped = disabledCount + fileRecords.filter(record => record?.skipped).length
        const passed = findings.filter(finding => finding.passed).length
        const failed = findings.length - passed
        return { filePath: file.path, passed, failed, skipped, findings, ok: failed === 0 }
      })
      const writable = run.safe.status === 'passed' || run.safe.status === 'repaired'
      return { files: outputFiles, results, run, writable }
    },
  }
}
