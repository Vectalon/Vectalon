import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import type { WorkflowPhase, WorkflowArtifact } from '../../adapters/types'
import { phaseResult, sanitizeFileName, detectConventions } from './helpers'
import { getIntent, isRemoveDependency, isRefactor, isFix } from './intent'
import { writeProjectFile, isSelfPackageRepo, GENERATED_OUTPUT_DIR } from './fileOutput'
import { MaestroFlowWriter } from '../../sdlc/MaestroFlowWriter'
import { summarizeImpactReport, impactReportFromContext } from '../../harness/impact'
import { detectUrlScheme, buildDeepLink, kebabCase } from '../../utils/deepLink'
import { reportError } from '../../utils/safe'

/** Best-effort Android applicationId / bundle id for the Maestro header. */
function inferAppId(root: string | undefined): string {
  if (!root) return 'com.example.app'
  try {
    const gradle = join(root, 'android', 'app', 'build.gradle')
    if (existsSync(gradle)) {
      const m = readFileSync(gradle, 'utf-8').match(/applicationId\s+["']([^"']+)["']/)
      if (m) return m[1]
    }
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8')) as { name?: string }
    if (pkg.name && pkg.name.includes('.')) return pkg.name
  } catch (err) {
    reportError(err, 'testPhase: inferring app id from gradle/package.json')
  }
  return 'com.example.app'
}

function isE2EFlow(path: string): boolean {
  return path.startsWith('.maestro/')
}

export const testPhase: WorkflowPhase = {
  id: 'tests',
  name: 'Test writing',
  description: 'Write tests first (TDD) based on acceptance criteria and feature requirements, before any implementation code.',
  run: async (ctx) => {
    const intent = (await getIntent(ctx)).intent
    const conventions = detectConventions(ctx.snapshot)
    const ext = conventions.hasTypeScript ? 'ts' : 'js'
    // The screen test renders JSX (render(<FeatureScreen />)) — it must live in
    // a .tsx/.jsx file or tsc rejects it with TS1005. The hook and service tests
    // contain no JSX and stay .ts/.js.
    const jsxExt = conventions.hasTypeScript ? 'tsx' : 'jsx'
    const featureName = sanitizeFileName(ctx.prompt) || 'Feature'
    const camelName = featureName.charAt(0).toLowerCase() + featureName.slice(1)
    const projectRoot = ctx.projectRoot

    // Dependency removal needs no new tests — it removes code, it does not add behavior.
    if (isRemoveDependency(intent)) {
      return phaseResult(
        'tests',
        'Test writing',
        'Write tests first (TDD) based on acceptance criteria and feature requirements, before any implementation code.',
        'Skipping test generation for dependency removal.',
        []
      )
    }

    // Refactors do not create new scaffold modules — the implementation phase
    // produces a change plan and modifies existing files — so writing fresh
    // tests that import src/screens/<Feature>Screen would target files that
    // never exist. Tests for a refactor must be updated against the refactored
    // module itself, which the implementation phase handles.
    if (isRefactor(intent)) {
      return phaseResult(
        'tests',
        'Test writing',
        'Write tests first (TDD) based on acceptance criteria and feature requirements, before any implementation code.',
        'Skipping scaffold test generation for refactor; tests must be updated against the refactored module.',
        []
      )
    }

    // Fix requests repair EXISTING files (lint/type/test violations). They do not
    // introduce new scaffold modules, so there are no new contracts to write —
    // existing tests must simply keep passing after the fix.
    if (isFix(intent)) {
      return phaseResult(
        'tests',
        'Test writing',
        'Write tests first (TDD) based on acceptance criteria and feature requirements, before any implementation code.',
        'Skipping scaffold test generation for fix requests; the implementation phase repairs existing files and existing tests must keep passing.',
        []
      )
    }

    // Unclassified requests get a clarifying plan from the implementation phase,
    // never a generic scaffold — so there are no new test contracts to write.
    if (intent.type === 'unknown') {
      return phaseResult(
        'tests',
        'Test writing',
        'Write tests first (TDD) based on acceptance criteria and feature requirements, before any implementation code.',
        'Skipping test generation because the request could not be classified; the implementation phase will produce a clarification plan instead of new code.',
        []
      )
    }

    // Gather context from previous phases to drive the test contract
    const prdPhase = ctx.state.phases.find(p => p.id === 'prd')
    const acceptancePhase = ctx.state.phases.find(p => p.id === 'acceptance-criteria')
    const acceptanceCriteria = acceptancePhase?.output || prdPhase?.output || ''

    // Tests are written BEFORE implementation. They define the contract that the
    // implementation phase (model or scaffold) must satisfy. Imports use the named
    // exports produced by the implementation scaffold so the tests compile and run.
    const testFiles: { path: string; content: string }[] = []

    // 1. Screen component test
    testFiles.push({
      path: `src/__tests__/${featureName}.${jsxExt}`,
      content: [
        `// TDD test suite for ${featureName} — written before implementation.`,
        `// Run \`npm test ${featureName}\` to verify the implementation satisfies these requirements.`,
        '',
        "import React from 'react';",
        "import { render } from '@testing-library/react-native';",
        `import { ${featureName}Screen } from '../screens/${featureName}Screen';`,
        '',
        `describe('${featureName}Screen', () => {`,
        // RNTL v14 made render() async — await it or tsc errors on the result type.
        `  it('renders the ${featureName} title', async () => {`,
        `    const { getByText } = await render(<${featureName}Screen />);`,
        `    expect(getByText('${featureName}')).toBeDefined();`,
        '  });',
        '});',
        '',
      ].join('\n'),
    })

    // 2. Hook test
    testFiles.push({
      path: `src/__tests__/use${featureName}.${ext}`,
      content: [
        `// TDD test suite for use${featureName} — written before implementation.`,
        '',
        "import { renderHook, act } from '@testing-library/react-native';",
        `import { use${featureName} } from '../hooks/use${featureName}';`,
        '',
        `describe('use${featureName}', () => {`,
        // RNTL v14 made renderHook() async — await it or tsc errors on the result type.
        `  it('starts in the default state', async () => {`,
        `    const { result } = await renderHook(() => use${featureName}());`,
        '    expect(result.current.loading).toBe(false);',
        '    expect(result.current.error).toBeNull();',
        '    expect(result.current.data).toBeNull();',
        '  });',
        '',
        `  it('stores the result after running', async () => {`,
        `    const { result } = await renderHook(() => use${featureName}());`,
        '    await act(async () => {',
        '      await result.current.run();',
        '    });',
        `    expect(result.current.data).toBe('ok');`,
        '    expect(result.current.loading).toBe(false);',
        '  });',
        '});',
        '',
      ].join('\n'),
    })

    // 3. Service test
    testFiles.push({
      path: `src/__tests__/${featureName}Api.${ext}`,
      content: [
        `// TDD test suite for ${featureName}Api — written before implementation.`,
        '',
        `import { ${camelName}Api } from '../services/${featureName}Api';`,
        '',
        `describe('${featureName}Api', () => {`,
        `  it('executes and returns a result', async () => {`,
        `    const result = await ${camelName}Api.execute();`,
        '    expect(result).toBeDefined();',
        '  });',
        '});',
        '',
      ].join('\n'),
    })

    // Maestro E2E flow — a deterministic YAML walkthrough derived from the
    // acceptance criteria (no model calls). Generated alongside the unit tests
    // so the verification phase can run it on a simulator/emulator. When the
    // request or criteria mention accessibility, an accessibility variant is
    // also generated (explicit accessibility-tree selectors + screen-reader
    // guidance) for VoiceOver / TalkBack verification.
    const appId = inferAppId(projectRoot)
    const flowFiles: { path: string; content: string }[] = []
    if (acceptanceCriteria) {
      flowFiles.push({
        path: `.maestro/${featureName}.yaml`,
        content: new MaestroFlowWriter().writeFlow(acceptanceCriteria, { featureName, appId }),
      })
      if (/accessib|voiceover|talkback|screen\s*-?reader/i.test(`${ctx.prompt}\n${acceptanceCriteria}`)) {
        flowFiles.push({
          path: `.maestro/${featureName}-accessibility.yaml`,
          content: new MaestroFlowWriter().writeFlow(acceptanceCriteria, { featureName, appId, accessibility: true }),
        })
      }
    }

    // Impact regression flows — Maestro walks through the screens the impact
    // stage flagged as affected, so the change's blast radius is exercised
    // end-to-end (not just the new feature screen). One deterministic flow per
    // affected screen: launch → deep-link when the app exposes a URL scheme →
    // assert the screen renders → screenshot. The verification phase runs these
    // advisory; failures mean an affected screen regressed.
    const impact = summarizeImpactReport(impactReportFromContext(ctx))
    const scheme = projectRoot ? detectUrlScheme(projectRoot) : null
    const impactFlowLabels: string[] = []
    for (const screen of impact.screens) {
      if (screen.toLowerCase() === featureName.toLowerCase()) continue // the feature flow already covers it
      const slug = kebabCase(screen) || 'screen'
      const path = `.maestro/${slug}-impact.yaml`
      flowFiles.push({
        path,
        content: new MaestroFlowWriter().writeScreenFlow(screen, {
          appId,
          deepLink: scheme ? buildDeepLink(scheme, screen) : undefined,
        }),
      })
      impactFlowLabels.push(`- \`${path}\` — regression flow for the affected screen \`${screen}\`${scheme ? ` (deep-link \`${buildDeepLink(scheme, screen)}\`)` : ''}`)
    }
    testFiles.push(...flowFiles)

    const writtenTests: string[] = []
    const artifacts: WorkflowArtifact[] = []
    const redirected = projectRoot ? isSelfPackageRepo(projectRoot) : false

    if (projectRoot) {
      for (const file of testFiles) {
        const written = writeProjectFile(projectRoot, file.path, file.content)
        if (written) {
          writtenTests.push(written)
          artifacts.push({ type: isE2EFlow(file.path) ? 'e2e' : 'qa', title: file.path, content: file.content, path: written })
        }
      }
    } else {
      // No project root: record the tests as artifacts so the TDD gate can still
      // verify that tests were written before implementation.
      for (const file of testFiles) {
        artifacts.push({ type: isE2EFlow(file.path) ? 'e2e' : 'qa', title: file.path, content: file.content })
      }
    }

    const redirectNote = redirected
      ? [`> ⚠️ Generated into ${GENERATED_OUTPUT_DIR}/ (this project is the rn-vectalon package itself; its src/ bundle is protected).`, '']
      : []

    const output = [
      '# Test-Driven Development — Tests written before implementation',
      '',
      `Feature: ${ctx.prompt}`,
      '',
      `Acceptance criteria source: ${acceptanceCriteria ? 'PRD / acceptance criteria captured' : 'none — using default component contract'}`,
      '',
      writtenTests.length > 0
        ? `## Test files written (${writtenTests.length})`
        : '## Test files (simulated — no project root)',
      '',
      ...writtenTests.map(t => `- \`${t}\``),
      ...redirectNote,
      '',
      ...(flowFiles.length > 0
        ? [
            '## E2E flow',
            '',
            ...flowFiles.map(f => `- \`${f.path}\` — Maestro ${f.path.includes('accessibility') ? 'accessibility' : 'E2E'} flow generated from the acceptance criteria (run with \`maestro test\` on a booted simulator/emulator)`),
            '',
          ]
        : []),
      ...(impactFlowLabels.length > 0
        ? [
            '## Impact regression flows',
            '',
            ...impactFlowLabels,
            '',
            'These flows cover the screens the impact stage flagged as affected — run them to verify the change did not regress existing UI.',
            '',
          ]
        : []),
      '## TDD Approach',
      '1. These tests define the expected behavior BEFORE implementation.',
      '2. The implementation phase must make these tests pass.',
      '3. The verification phase re-runs the tests after code changes and reports failures.',
      '',
      '## Next step',
      'Run the implementation phase to generate code that satisfies these tests.',
    ].join('\n')

    return phaseResult(
      'tests',
      'Test writing',
      'Write tests first (TDD) based on acceptance criteria and feature requirements, before any implementation code.',
      output,
      artifacts
    )
  },
}
