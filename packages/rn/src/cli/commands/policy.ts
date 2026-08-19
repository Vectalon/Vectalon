import { existsSync, readFileSync } from 'fs'
import { join, resolve } from 'path'
import { logger } from '../logger'
import { initPolicy, PolicyEngine } from '../../guardrails'

interface PolicyOptions {
  init?: boolean
  check?: string
}

export async function policyCommand(directory: string, options: PolicyOptions): Promise<void> {
  const root = resolve(directory || process.cwd())
  const vectalonDir = join(root, '.vectalon')

  if (!existsSync(vectalonDir)) {
    logger.error('No .vectalon/ directory found. Run `vectalon init` first.')
    process.exit(1)
  }

  if (options.init) {
    const policyPath = initPolicy(root)
    logger.info(`Created default policy at ${policyPath}`)
    logger.info('Edit it to enable/disable rules or add project-specific custom rules.')
    return
  }

  if (options.check) {
    const filePath = options.check
    const fullPath = resolve(filePath)
    if (!existsSync(fullPath)) {
      logger.error(`File not found: ${filePath}`)
      process.exit(1)
    }
    const engine = new PolicyEngine(root)
    const content = readFileSync(fullPath, 'utf-8')
    const result = await engine.runPolicyWithHarness({ filePath, content })
    logger.info(`Policy check for ${filePath}`)
    logger.info(`Passed: ${result.passed} | Failed: ${result.failed} | Skipped: ${result.skipped}`)
    for (const finding of result.findings) {
      const icon = finding.passed ? '✅' : finding.severity === 'error' ? '❌' : '⚠️'
      logger.info(`${icon} ${finding.rule}: ${finding.passed ? 'OK' : finding.message}`)
    }
    if (!result.ok) {
      process.exit(1)
    }
    return
  }

  const engine = new PolicyEngine(root)
  const policy = engine.getPolicy()
  logger.info(`Policy file: ${engine.getPolicyPath()}`)
  logger.info(`Version: ${policy.version}`)
  logger.info(`Base rule overrides: ${Object.keys(policy.rules || {}).length}`)
  logger.info(`Custom rules: ${(policy.customRules || []).length}`)
}
