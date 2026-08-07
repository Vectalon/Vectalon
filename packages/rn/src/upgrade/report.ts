/**
 * vectalon upgrade — report rendering
 * Business Source License 1.1 (BSL-1.1)
 */

import Table from 'cli-table'
import pc from 'picocolors'
import { logger } from '../cli/logger'
import { describeDetection } from './detect'
import { summarizeImpact } from './impact'
import { newArchitectureLabel } from '../utils/newArchitecture'
import type { MigrationStep, UpgradeReport, VerifyCheck } from './types'

const RISK_COLOR: Record<string, (s: string) => string> = {
  low: pc.green,
  medium: pc.yellow,
  high: pc.red,
}

const KIND_LABEL: Record<string, string> = {
  auto: pc.green('AUTO'),
  review: pc.yellow('REVIEW'),
  manual: pc.cyan('MANUAL'),
}

export function renderUpgradeReport(report: UpgradeReport): void {
  logger.info(pc.bold(pc.cyan('🔧 vectalon upgrade')))
  logger.info(`   ${describeDetection(report.from)}`)
  logger.info(`   Target: ${pc.bold(report.target ?? 'unknown')}${report.dryRun && !report.applied ? ' · dry run (no files changed)' : ''}`)
  logger.info(`   New Architecture: ${newArchitectureLabel(report.newArchBefore ?? undefined)} → ${report.applied ? newArchitectureLabel(report.newArchAfter ?? undefined) : pc.dim('after apply')}`)
  logger.info('')

  if (report.errors.length > 0) {
    for (const err of report.errors) {
      logger.warn(err)
    }
    logger.info('')
  }

  if (report.steps.length === 0 && report.impact.length === 0) {
    logger.info(pc.dim('No applicable migrations found for this target.'))
  }

  if (report.steps.length > 0) {
    logger.info(pc.bold(`Migration plan — ${report.steps.length} step(s)`))
    const table = new Table({
      head: ['Kind', 'Risk', 'Step', 'What changes'],
      style: { head: ['cyan'] },
      colWidths: [10, 8, 34, 76],
    })
    for (const step of report.steps) {
      table.push([
        KIND_LABEL[step.kind],
        RISK_COLOR[step.risk](step.risk.toUpperCase()),
        step.id,
        `${step.title}${step.edits.length > 0 ? ` — ${step.edits.length} edit(s)` : ''}`,
      ])
    }
    process.stdout.write(table.toString() + '\n')
    logger.info('')
  }

  if (report.impact.length > 0) {
    const summary = summarizeImpact(report.impact)
    logger.info(pc.bold(`Impact analysis — ${summary.total} finding(s) across ${summary.files} file(s) (${summary.high} high · ${summary.medium} medium · ${summary.low} low)`))
    const table = new Table({
      head: ['Risk', 'Category', 'File', 'Pattern'],
      style: { head: ['cyan'] },
      colWidths: [8, 14, 44, 66],
    })
    for (const f of report.impact.slice(0, 25)) {
      table.push([RISK_COLOR[f.risk](f.risk.toUpperCase()), f.category, f.file, f.pattern])
    }
    process.stdout.write(table.toString() + '\n')
    if (report.impact.length > 25) {
      logger.info(pc.dim(`…and ${report.impact.length - 25} more — see the JSON/manifest for the full list`))
    }
    logger.info('')
  }

  // Manual instructions.
  const withManual = report.steps.filter(s => s.kind === 'manual' && s.manual.length > 0)
  if (withManual.length > 0) {
    logger.info(pc.bold('Manual steps (no safe codemod exists)'))
    for (const step of withManual) {
      logger.info(`  ${RISK_COLOR[step.risk]('›')} ${step.title}`)
      for (const m of step.manual) {
        logger.info(`      · ${m}`)
      }
    }
    logger.info('')
  }

  if (report.provenance.dir) {
    logger.info(pc.bold('Provenance'))
    logger.info(`   Manifest: ${report.provenance.manifest}`)
    logger.info(`   Report:   ${report.provenance.report}`)
    logger.info('')
  }

  if (report.verify) {
    logger.info(pc.bold('Verification'))
    for (const check of report.verify.checks) {
      logger.info(`   ${verifyIcon(check)} ${check.name}: ${check.detail}`)
    }
    logger.info('')
  }

  // Summary line.
  const riskColor = RISK_COLOR[report.riskLabel]
  logger.info(
    pc.bold(`Summary: ${report.autoSteps} auto · ${report.reviewSteps} review · ${report.manualSteps} manual steps — risk ${riskColor(report.riskLabel.toUpperCase())} (${report.totalRisk})`)
  )
  if (report.applied) {
    logger.success(`${report.edits.length} codemod edit(s) applied to disk`)
  } else if (!report.dryRun && report.steps.length > 0) {
    logger.warn('Nothing applied — re-run with --apply to execute the codemods (add --force for review steps).')
  }
  if (report.verify && !report.verify.passed) {
    logger.error('Verification failed — inspect the failing checks above.')
  }
}

function verifyIcon(check: VerifyCheck): string {
  switch (check.status) {
    case 'ok':
      return pc.green('✔')
    case 'warn':
      return pc.yellow('⚠')
    case 'fail':
      return pc.red('✖')
    default:
      return pc.dim('·')
  }
}

export function renderStepDetail(step: MigrationStep): string {
  return [step.title, ...step.manual].join('\n')
}
