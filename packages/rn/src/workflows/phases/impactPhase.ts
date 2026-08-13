import type { WorkflowPhase, WorkflowArtifact } from '../../adapters/types'
import { analyzeCrossPackageImpact, renderImpactReport, writeImpactDoc } from '../../harness/impact'
import { runCommand } from '../../adapters/runCommand'
import { phaseResult } from './helpers'
import { getIntent, isAddFeature, isRemoveDependency, isRefactor, isFix } from './intent'
import { reportError } from '../../utils/safe'

/**
 * Changed files in the working tree (tracked + untracked, staged + unstaged),
 * best-effort — returns [] when the directory is not a git repo. Impact runs
 * before implementation in the SDLC order, so the tree's current diff (plus
 * any explicit `ctx.inputs.changedFiles`) is the best signal of what will be
 * touched by this feature.
 */
async function changedFilesInTree(root: string): Promise<string[]> {
  try {
    const result = await runCommand('git', ['status', '--porcelain', '--untracked-files=all'], { cwd: root })
    if (!result.success) return []
    return result.stdout
      .split('\n')
      .map(line => line.replace(/^\S+\s+/, '').trim())
      .filter(Boolean)
      .sort()
  } catch (err) {
    reportError(err, 'impactPhase: reading git status', 'warn')
    return []
  }
}

/** Backticked paths the scope stage listed (e.g. remove-dependency import sites). */
const BACKTICK_PATH_RE = /`([^`\n]+)`/g

/**
 * Component-ish names the PRD / scope stage named — screens, pages, cards,
 * navigators — that the impact harness can resolve to defining files even
 * before any code for the feature exists.
 */
const COMPONENT_NAME_RE =
  /\b[A-Z][A-Za-z0-9]*(?:Screen|Page|View|Modal|Sheet|Form|Card|List|Row|Cell|Header|Footer|Item|Container|Navigator|Stack|Tab|Panel)\b/g

/**
 * React Native core API / component names that match the suffix pattern but
 * are never app components — `StyleSheet usage` from the scope conventions
 * section would otherwise become a fake blast-radius input (and the doc slug).
 */
const RN_CORE_NAMES = new Set([
  'StyleSheet',
  'SafeAreaView',
  'FlatList',
  'SectionList',
  'ScrollView',
  'VirtualizedList',
  'ActivityIndicator',
  'KeyboardAvoidingView',
  'TouchableOpacity',
  'TouchableHighlight',
  'TouchableWithoutFeedback',
  'Pressable',
  'Modal',
  'ListView',
  'RefreshControl',
  'DrawerLayoutAndroid',
  'Switch',
  'TextInput',
  'StatusBar',
  'View',
  'Text',
  'Image',
  'Button',
  'Alert',
  'Animated',
  'PanResponder',
  'Navigator',
  'TabBarIOS',
  'KeyboardAvoidingView',
  'DatePickerIOS',
  'Picker',
  'SegmentedControlIOS',
  'Slider',
  'ToastAndroid',
  'ProgressBarAndroid',
  'ToolbarAndroid',
  'Card',
])

/**
 * Extract candidate changed inputs from the PRD and scope stage outputs:
 * backticked file paths (real paths the scope listed, e.g. the files that
 * import a dependency slated for removal) and component names (screens/cards
 * the docs say the feature will touch). URLs and prose-with-spaces are noise.
 */
export function signalsFromDocs(...outputs: Array<string | undefined>): string[] {
  const signals = new Set<string>()
  for (const out of outputs) {
    if (!out) continue
    for (const m of out.matchAll(BACKTICK_PATH_RE)) {
      const p = m[1].trim()
      if (!p) continue
      if (/^(https?:|\/\/)/.test(p) || p.includes(' ')) continue
      signals.add(p)
    }
    for (const m of out.matchAll(COMPONENT_NAME_RE)) {
      if (!RN_CORE_NAMES.has(m[0])) {
        signals.add(m[0])
      }
    }
  }
  return [...signals]
}

/**
 * Impact-analysis stage — deterministic cross-package blast radius.
 *
 * Runs `analyzeCrossPackageImpact` over the working-tree diff (or explicit
 * changed files) and persists a feature-named doc into the same tracked home
 * as the standalone `vectalon impact` command, so the blast-radius analysis
 * survives clones and shows up in PRs. No model calls — the graph comes from
 * the same AST analysis as the knowledge graph.
 */
export const impactPhase: WorkflowPhase = {
  id: 'impact',
  name: 'Impact analysis',
  description: 'Compute cross-package blast radius: affected packages, screens, navigators, and E2E flows.',
  run: async (ctx) => {
    const intent = (await getIntent(ctx)).intent

    // Signals, in priority order: explicit changed files, then what the PRD and
    // scope stages ALREADY decided the feature touches (backticked paths +
    // component names), then the working-tree diff. The PRD/scope signals are
    // what give a brand-new feature a real blast radius before any of its
    // files exist — e.g. removing a dependency lists the files that import it.
    const explicit = (ctx.inputs.changedFiles as string[] | undefined) || []
    const prd = ctx.state.phases.find(p => p.id === 'prd')?.output
    const scope = ctx.state.phases.find(p => p.id === 'scope')?.output
    const derived = signalsFromDocs(prd, scope)
    const tree = await changedFilesInTree(ctx.projectRoot)
    const changed = [...new Set([...explicit, ...derived, ...tree])].filter(Boolean)
    if (changed.length === 0) {
      if (isAddFeature(intent)) changed.push(intent.feature)
      else if (isRemoveDependency(intent)) changed.push(intent.dependency)
      else if (isRefactor(intent)) changed.push(intent.target)
      else if (isFix(intent)) changed.push(intent.area)
    }

    const impact = analyzeCrossPackageImpact(ctx.projectRoot, changed)
    const sources = [
      explicit.length > 0 ? 'explicit changed files' : null,
      derived.length > 0 ? 'PRD + scope docs' : null,
      tree.length > 0 ? 'working-tree diff' : null,
    ].filter(Boolean)
    const sourceNote = sources.length > 0 ? `_Signals from: ${sources.join(', ')}._\n\n` : ''
    const report = sourceNote + renderImpactReport(impact)

    // Persist the feature-named doc (slug from the first changed file) into the
    // tracked impact home — same convention as `vectalon impact --out`.
    let docPath: string | undefined
    try {
      docPath = writeImpactDoc(ctx.projectRoot, impact, report)
    } catch (err) {
      reportError(err, 'impactPhase: writing impact doc', 'warn')
    }

    const artifacts: WorkflowArtifact[] = [{ type: 'research', title: `Impact: ${ctx.prompt}`, content: report }]
    if (docPath) {
      artifacts.push({
        type: 'document',
        title: `Impact analysis: ${ctx.prompt}`,
        content: report,
        path: docPath,
      })
    }

    return phaseResult(
      'impact',
      'Impact analysis',
      'Compute cross-package blast radius: affected packages, screens, navigators, and E2E flows.',
      report,
      artifacts
    )
  },
}
