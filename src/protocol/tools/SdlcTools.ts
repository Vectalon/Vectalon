import { existsSync, readFileSync } from 'fs'
import { ToolRegistry } from './base'
import { mcpTool } from './decorators'
import { parseList, parseTickets } from './shared'
import { reportError } from '../../utils/safe'
import { RequirementWriter } from '../../sdlc/RequirementWriter'
import { StoryWriter } from '../../sdlc/StoryWriter'
import { AcceptanceCriteriaWriter } from '../../sdlc/AcceptanceCriteriaWriter'
import { GapAnalyzer } from '../../sdlc/GapAnalyzer'
import { SupportTicketAnalyzer } from '../../sdlc/SupportTicketAnalyzer'
import { TestPlanWriter } from '../../sdlc/TestPlanWriter'
import { BugTriageAnalyzer } from '../../sdlc/BugTriageAnalyzer'
import { RootCauseAnalyzer } from '../../sdlc/RootCauseAnalyzer'
import { CodeReviewAnalyzer } from '../../sdlc/CodeReviewAnalyzer'
import { reviewCodeWithLLM, formatLLMReview } from '../../sdlc/LLMCodeReviewer'
import { RefactorSuggester } from '../../sdlc/RefactorSuggester'
import { ADRWriter } from '../../sdlc/ADRWriter'
import { TradeoffAnalyzer } from '../../sdlc/TradeoffAnalyzer'
import type { TradeoffOption } from '../../sdlc/TradeoffAnalyzer'
import { ThreatModeler } from '../../sdlc/ThreatModeler'
import { AccessibilityChecker } from '../../sdlc/AccessibilityChecker'
import { DesignSystemExtractor } from '../../sdlc/DesignSystemExtractor'
import { WireframeGenerator } from '../../sdlc/WireframeGenerator'
import { ReleaseNoteWriter } from '../../sdlc/ReleaseNoteWriter'
import { IncidentAnalyzer } from '../../sdlc/IncidentAnalyzer'
import { RunbookWriter } from '../../sdlc/RunbookWriter'
import { KpiReportAnalyzer } from '../../sdlc/KpiReportAnalyzer'
import type { KpiMetric } from '../../sdlc/KpiReportAnalyzer'
import { MaestroFlowWriter } from '../../sdlc/MaestroFlowWriter'
import { NativeModuleGenerator, parseNativeModuleSpec } from '../../sdlc/NativeModuleGenerator'
import { parseTelemetryContent } from '../../knowledge/telemetry'
import { parseMetroStats, analyzeBundleStats, checkBundleBudgets, checkStaticBudgets, type BudgetFinding } from '../../utils/bundleAnalyzer'
import type { ParsedCrash, TelemetryEvent } from '../../knowledge/telemetry'

/**
 * SDLC analysis/writing tools — requirements, QA, architecture/security/UX,
 * DevOps/ops/analytics, and Maestro E2E flows. Each is a deterministic scaffold
 * or analyzer over its inputs; artifacts are persisted when a store is attached.
 */
export class SdlcTools extends ToolRegistry {
  @mcpTool('write_prd', 'Write a Product Requirements Document scaffold for a feature', {
    type: 'object',
    properties: {
      projectName: { type: 'string' },
      feature: { type: 'string' },
      featureIdeas: { type: 'string' },
      enhance: { type: 'boolean' },
    },
    required: ['feature'],
  })
  async writePrd(args: Record<string, unknown>): Promise<string> {
    const feature = (args.feature as string) || 'untitled feature'
    const snapshot = this.ctx.engine.getSnapshot()
    const projectName = (args.projectName as string) || snapshot?.project.name || 'project'
    const featureIdeas = parseList(args.featureIdeas)

    const scaffold = new RequirementWriter().writePRD({ projectName, feature, featureIdeas })
    const content = await this.maybeEnhance(
      args,
      scaffold,
      'You are a product manager writing a Product Requirements Document. Expand the scaffold into a complete PRD.'
    )
    this.persistArtifact('product', `PRD: ${feature}`, content)
    return content
  }

  @mcpTool('write_user_stories', 'Write user stories for a feature, one per persona', {
    type: 'object',
    properties: {
      feature: { type: 'string' },
      personas: { type: 'string' },
      parentId: { type: 'string' },
      enhance: { type: 'boolean' },
    },
    required: ['feature'],
  })
  async writeUserStories(args: Record<string, unknown>): Promise<string> {
    const feature = (args.feature as string) || 'untitled feature'
    const personas = parseList(args.personas)

    const scaffold = new StoryWriter().writeUserStories({ feature, personas })
    const content = await this.maybeEnhance(
      args,
      scaffold,
      'You are a business analyst writing user stories. Expand the scaffold into complete stories with the right format.'
    )
    this.persistArtifact('requirements', `User Stories: ${feature}`, content, args.parentId)
    return content
  }

  @mcpTool('define_acceptance_criteria', 'Define Given/When/Then acceptance criteria for a user story', {
    type: 'object',
    properties: {
      story: { type: 'string' },
      parentId: { type: 'string' },
    },
    required: ['story'],
  })
  async defineAcceptanceCriteria(args: Record<string, unknown>): Promise<string> {
    const story = (args.story as string) || ''
    const content = new AcceptanceCriteriaWriter().writeAcceptanceCriteria(story)
    const label = story.replace(/\s+/g, ' ').slice(0, 60)
    this.persistArtifact('requirements', `Acceptance Criteria: ${label}`, content, args.parentId)
    return content
  }

  @mcpTool('analyze_support_tickets', 'Group support tickets into themes and suggest next steps', {
    type: 'object',
    properties: {
      tickets: { type: 'string' },
    },
    required: ['tickets'],
  })
  async analyzeSupportTickets(args: Record<string, unknown>): Promise<string> {
    const analyzer = new SupportTicketAnalyzer()
    const analysis = analyzer.analyze(parseTickets(args.tickets))
    const content = analyzer.render(analysis)
    this.persistArtifact('research', 'Support Ticket Analysis', content)
    return content
  }

  @mcpTool('run_gap_analysis', 'Compare desired capabilities against current ones and report gaps', {
    type: 'object',
    properties: {
      desired: { type: 'string' },
      current: { type: 'string' },
    },
    required: ['desired', 'current'],
  })
  async runGapAnalysis(args: Record<string, unknown>): Promise<string> {
    const analyzer = new GapAnalyzer()
    const analysis = analyzer.analyze({
      desired: parseList(args.desired),
      current: parseList(args.current),
    })
    const content = analyzer.render(analysis)
    this.persistArtifact('research', 'Gap Analysis', content)
    return content
  }

  @mcpTool('write_test_plan', 'Write a QA test plan scaffold for a feature', {
    type: 'object',
    properties: {
      feature: { type: 'string' },
      scope: { type: 'string' },
      environments: { type: 'string' },
    },
    required: ['feature'],
  })
  async writeTestPlan(args: Record<string, unknown>): Promise<string> {
    const feature = (args.feature as string) || 'untitled feature'
    const content = new TestPlanWriter().writeTestPlan({
      feature,
      scope: parseList(args.scope),
      environments: parseList(args.environments),
    })
    this.persistArtifact('qa', `Test Plan: ${feature}`, content)
    return content
  }

  @mcpTool('triage_bugs', 'Triage a list of bug reports by severity and priority', {
    type: 'object',
    properties: {
      bugs: { type: 'string' },
    },
    required: ['bugs'],
  })
  async triageBugs(args: Record<string, unknown>): Promise<string> {
    const analyzer = new BugTriageAnalyzer()
    const triage = analyzer.triage(parseTickets(args.bugs))
    const content = analyzer.render(triage)
    this.persistArtifact('qa', 'Bug Triage', content)
    return content
  }

  @mcpTool('analyze_root_cause', 'Analyze the probable root cause of a production issue', {
    type: 'object',
    properties: {
      issue: { type: 'string' },
    },
    required: ['issue'],
  })
  async analyzeRootCause(args: Record<string, unknown>): Promise<string> {
    const issue = (args.issue as string) || ''
    const result = new RootCauseAnalyzer().analyze(issue)
    const content = new RootCauseAnalyzer().render(result)
    this.persistArtifact('qa', 'Root Cause Analysis', content)
    return content
  }

  @mcpTool('analyze_crash', 'Analyze a runtime crash report (Sentry event or Firebase Crashlytics JSON, or a path to an export file) using the actual crash facts — stack frames, release, environment — and return a data-driven root-cause analysis', {
    type: 'object',
    properties: {
      crash: { type: 'string' },
      crashFile: { type: 'string' },
    },
  })
  async analyzeCrash(args: Record<string, unknown>): Promise<string> {
    const raw = (args.crash as string | undefined) || ''
    const crashFile = (args.crashFile as string | undefined) || ''

    let events: TelemetryEvent[] = []
    if (raw.trim()) {
      events = parseTelemetryContent(raw)
    } else if (crashFile && existsSync(crashFile)) {
      events = parseTelemetryContent(readFileSync(crashFile, 'utf-8'))
    } else {
      return 'Pass a `crash` JSON string or a `crashFile` path pointing at a Sentry event / Crashlytics report export.'
    }

    const crash = events.find((e): e is ParsedCrash => e.kind === 'crash')
    if (!crash) return 'No crash event could be parsed from the provided input. Expected a Sentry event (exception.stacktrace.frames) or a Firebase Crashlytics report (app_info + event.type crash/error/anr).'

    const analyzer = new RootCauseAnalyzer()
    const result = analyzer.analyzeCrash(crash)
    const content = analyzer.renderCrash(result)
    this.persistArtifact('telemetry', `Crash Analysis: ${crash.exceptionType || crash.message || crash.id}`, content)
    return content
  }

  @mcpTool('review_code', 'Run deterministic code review checks over a code snippet; also flags performance budgets (pass Metro `--json` bundle output in `bundleJson` for library-size checks; static sideEffects/image checks always run against the current project)', {
    type: 'object',
    properties: {
      code: { type: 'string' },
      language: { type: 'string' },
      bundleJson: { type: 'string' },
    },
    required: ['code'],
  })
  async reviewCode(args: Record<string, unknown>): Promise<string> {
    const code = (args.code as string) || ''
    const findings = new CodeReviewAnalyzer().review(code, (args.language as string) || 'tsx')
    const parts = [new CodeReviewAnalyzer().render(findings)]

    // Nit-picking LLM pass on top of the deterministic rules when a model is
    // available; falls back to rule-only output when the model is on its
    // fallback path (no downloaded model) or returns nothing parseable.
    const llmReview = await reviewCodeWithLLM(this.ctx.modelRouter, {
      code,
      fileName: (args.filename as string) || 'snippet.tsx',
      context: (args.context as string) || '',
    })
    if (llmReview) {
      parts.push(`## LLM Review\n\n${formatLLMReview(llmReview)}`)
    }

    // Deterministic performance budgets (no model calls):
    // 1. Bundle composition from Metro `--json` output — flags libraries >100 KB.
    // 2. On-disk static checks — missing `sideEffects: false`, unoptimized
    //    images, oversized assets — against the server's project root.
    const budgetFindings: BudgetFinding[] = []
    const rawBundle = (args.bundleJson as string | undefined) || ''
    if (rawBundle.trim()) {
      try {
        const stats = parseMetroStats(rawBundle)
        if (stats) {
          budgetFindings.push(...checkBundleBudgets(analyzeBundleStats(stats)))
        }
      } catch (err) {
        reportError(err, 'review_code: parsing bundleJson')
      }
    }
    const projectRoot = this.ctx.engine.getSnapshot()?.project.root
    if (projectRoot) {
      try {
        budgetFindings.push(...checkStaticBudgets(projectRoot).findings)
      } catch (err) {
        reportError(err, 'review_code: static budget checks')
      }
    }
    if (budgetFindings.length > 0) {
      parts.push(`## Performance budgets\n\n${budgetFindings.map(f => `- ⚠️ [${f.rule}] ${f.message}`).join('\n')}`)
    }

    const content = parts.join('\n\n')
    this.persistArtifact('engineering', 'Code Review', content)
    return content
  }

  @mcpTool('suggest_refactors', 'Suggest refactors for a code snippet based on static heuristics', {
    type: 'object',
    properties: {
      code: { type: 'string' },
      filename: { type: 'string' },
    },
    required: ['code'],
  })
  async suggestRefactors(args: Record<string, unknown>): Promise<string> {
    const code = (args.code as string) || ''
    const suggestions = new RefactorSuggester().suggest(code, (args.filename as string) || 'Component.tsx')
    const content = new RefactorSuggester().render(suggestions)
    this.persistArtifact('engineering', 'Refactor Suggestions', content)
    return content
  }

  @mcpTool('write_adr', 'Write an Architecture Decision Record scaffold', {
    type: 'object',
    properties: {
      title: { type: 'string' },
      context: { type: 'string' },
      options: { type: 'string' },
      decision: { type: 'string' },
      number: { type: 'number' },
    },
    required: ['title', 'context'],
  })
  async writeAdr(args: Record<string, unknown>): Promise<string> {
    const title = (args.title as string) || 'Untitled decision'
    const context = (args.context as string) || 'No context provided.'
    const content = new ADRWriter().writeADR({
      title,
      context,
      options: parseList(args.options),
      decision: (args.decision as string) || 'TBD',
      number: typeof args.number === 'number' ? args.number : undefined,
    })
    this.persistArtifact('architecture', `ADR: ${title}`, content)
    return content
  }

  @mcpTool('analyze_tradeoffs', 'Rank architecture options by scored attributes (JSON array of { name, scores })', {
    type: 'object',
    properties: {
      options: { type: 'string' },
    },
    required: ['options'],
  })
  async analyzeTradeoffs(args: Record<string, unknown>): Promise<string> {
    const raw = (args.options as string) || ''
    let options: TradeoffOption[]
    try {
      const parsed = JSON.parse(raw)
      if (!Array.isArray(parsed)) throw new Error('not an array')
      options = parsed as TradeoffOption[]
    } catch (err) {
      reportError(err, 'MCPServer: invalid options JSON')
      return `Invalid options JSON. Expected an array of { name, scores: { attribute: 1-5 } }. Received: ${raw.slice(0, 200)}`
    }

    const analyzer = new TradeoffAnalyzer()
    const result = analyzer.analyze(options)
    const content = analyzer.render(result)
    this.persistArtifact('architecture', 'Tradeoff Analysis', content)
    return content
  }

  @mcpTool('threat_model', 'Produce a STRIDE threat model for a feature', {
    type: 'object',
    properties: {
      feature: { type: 'string' },
      components: { type: 'string' },
    },
  })
  async threatModel(args: Record<string, unknown>): Promise<string> {
    const modeler = new ThreatModeler()
    const threats = modeler.threatModel(parseList(args.feature), parseList(args.components))
    const content = modeler.render(threats)
    this.persistArtifact('security', 'Threat Model', content)
    return content
  }

  @mcpTool('check_accessibility', 'Run deterministic accessibility checks over JSX code', {
    type: 'object',
    properties: {
      code: { type: 'string' },
    },
    required: ['code'],
  })
  async checkAccessibility(args: Record<string, unknown>): Promise<string> {
    const code = (args.code as string) || ''
    const checker = new AccessibilityChecker()
    const findings = checker.check(code)
    const content = checker.render(findings)
    this.persistArtifact('design', 'Accessibility Check', content)
    return content
  }

  @mcpTool('extract_design_system', 'Extract design tokens (colors, spacing, fonts, radius) from style code', {
    type: 'object',
    properties: {
      code: { type: 'string' },
    },
    required: ['code'],
  })
  async extractDesignSystem(args: Record<string, unknown>): Promise<string> {
    const code = (args.code as string) || ''
    const extractor = new DesignSystemExtractor()
    const ds = extractor.extract(code)
    const content = extractor.render(ds)
    this.persistArtifact('design', 'Design System', content)
    return content
  }

  @mcpTool('generate_wireframe', 'Generate an ASCII wireframe for a screen from a section list', {
    type: 'object',
    properties: {
      title: { type: 'string' },
      sections: { type: 'string' },
    },
    required: ['title'],
  })
  async generateWireframe(args: Record<string, unknown>): Promise<string> {
    const title = (args.title as string) || 'Screen'
    const sections = parseList(args.sections)
    const content = new WireframeGenerator().generate(title, sections)
    this.persistArtifact('design', `Wireframe: ${title}`, content)
    return content
  }

  @mcpTool('write_release_notes', 'Write release notes for a version, auto-categorizing the change list', {
    type: 'object',
    properties: {
      version: { type: 'string' },
      date: { type: 'string' },
      changes: { type: 'string' },
    },
    required: ['version'],
  })
  async writeReleaseNotes(args: Record<string, unknown>): Promise<string> {
    const version = (args.version as string) || '0.0.0'
    const content = new ReleaseNoteWriter().writeReleaseNotes({
      version,
      date: (args.date as string) || undefined,
      changes: parseList(args.changes),
    })
    this.persistArtifact('devops', `Release Notes: v${version}`, content)
    return content
  }

  @mcpTool('analyze_incident', 'Analyze a production incident: severity, root-cause bucket, timeline, and actions', {
    type: 'object',
    properties: {
      title: { type: 'string' },
      description: { type: 'string' },
      severity: { type: 'string', enum: ['sev1', 'sev2', 'sev3'] },
      impact: { type: 'string' },
    },
    required: ['title', 'description'],
  })
  async analyzeIncident(args: Record<string, unknown>): Promise<string> {
    const analyzer = new IncidentAnalyzer()
    const analysis = analyzer.analyze({
      title: (args.title as string) || 'Untitled incident',
      description: (args.description as string) || '',
      severity: args.severity as 'sev1' | 'sev2' | 'sev3' | undefined,
      impact: (args.impact as string) || undefined,
    })
    const content = analyzer.render(analysis)
    this.persistArtifact('operations', `Incident: ${analysis.title}`, content)
    return content
  }

  @mcpTool('write_runbook', 'Write an ops runbook with symptoms, numbered steps, and escalation', {
    type: 'object',
    properties: {
      title: { type: 'string' },
      symptoms: { type: 'string' },
      steps: { type: 'string' },
      owner: { type: 'string' },
    },
    required: ['title'],
  })
  async writeRunbook(args: Record<string, unknown>): Promise<string> {
    const title = (args.title as string) || 'Untitled runbook'
    const content = new RunbookWriter().writeRunbook({
      title,
      symptoms: parseList(args.symptoms),
      steps: parseList(args.steps),
      owner: (args.owner as string) || undefined,
    })
    this.persistArtifact('operations', `Runbook: ${title}`, content)
    return content
  }

  @mcpTool('analyze_kpis', 'Evaluate KPI metrics with baselines and targets (JSON array of { name, current, previous, target })', {
    type: 'object',
    properties: {
      metrics: { type: 'string' },
    },
    required: ['metrics'],
  })
  async analyzeKpis(args: Record<string, unknown>): Promise<string> {
    const raw = (args.metrics as string) || ''
    let metrics: KpiMetric[]
    try {
      const parsed = JSON.parse(raw)
      if (!Array.isArray(parsed)) throw new Error('not an array')
      metrics = parsed as KpiMetric[]
    } catch (err) {
      reportError(err, 'MCPServer: invalid metrics JSON')
      return `Invalid metrics JSON. Expected an array of { name, current, previous?, target? }. Received: ${raw.slice(0, 200)}`
    }

    const analyzer = new KpiReportAnalyzer()
    const content = analyzer.render(analyzer.analyze(metrics))
    this.persistArtifact('analytics', 'KPI Report', content)
    return content
  }

  @mcpTool('generate_maestro_flow', 'Generate a Maestro YAML E2E flow from acceptance criteria (Given/When/Then)', {
    type: 'object',
    properties: {
      acceptanceCriteria: { type: 'string' },
      featureName: { type: 'string' },
      appId: { type: 'string' },
    },
  })
  async generateMaestroFlow(args: Record<string, unknown>): Promise<string> {
    const criteria = (args.acceptanceCriteria as string) || ''
    const flow = new MaestroFlowWriter().writeFlow(criteria, {
      featureName: (args.featureName as string) || undefined,
      appId: (args.appId as string) || undefined,
    })
    const fence = '```'
    return ['## Maestro E2E flow', '', `${fence}yaml`, flow.trimEnd(), fence].join('\n')
  }

  @mcpTool('scaffold_native_module', 'Deterministically scaffold a React Native New Architecture native module — TypeScript TurboModule spec, iOS Objective-C++ / Android Kotlin implementations, podspec / build.gradle entries, codegen config (bare RN CLI) or the Expo Modules API layout — from a structured JSON spec. Returns the full file tree ready to drop into the project', {
    type: 'object',
    properties: {
      spec: {
        type: 'string',
        description: 'JSON spec: { moduleName, packageName?, methods: [{ name, params?: [{ name, type }], returnType? }], constants?: Record<string,string|number|boolean>, events?: string[], component?: { name, props?: [{ name, type }], events? } }',
      },
      api: { type: 'string', enum: ['rn-cli', 'expo'] },
    },
    required: ['spec'],
  })
  async scaffoldNativeModule(args: Record<string, unknown>): Promise<string> {
    const raw = (args.spec as string) || ''
    if (!raw.trim()) {
      return 'Pass a `spec` JSON string describing the native module: { moduleName, methods, constants?, events?, component? }. Use api: "expo" for the Expo Modules API layout (default: bare RN CLI).'
    }
    let spec
    try {
      spec = parseNativeModuleSpec(raw)
    } catch (err) {
      return err instanceof Error ? err.message : String(err)
    }
    const generator = new NativeModuleGenerator()
    const result = generator.generate(spec, { api: args.api === 'expo' ? 'expo' : 'rn-cli' })
    const content = generator.render(result)
    this.persistArtifact('engineering', `Native module scaffold: ${result.spec.moduleName}`, content)
    return content
  }
}
