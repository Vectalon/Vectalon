/**
 * Deterministic Maestro E2E flow generation from acceptance criteria — no model
 * calls. Parses Given/When/Then (or plain bullet) text into a Maestro YAML
 * flow: launchApp → tapOn / inputText / swipe / openLink / scrollUntilVisible →
 * assertVisible / assertNotVisible, ending with a screenshot for the PR.
 *
 * Output shape (Maestro format):
 *   appId: com.example.app
 *   ---
 *   - launchApp
 *   - tapOn: "Login"
 *   - assertVisible: "Welcome"
 */

export interface MaestroFlowOptions {
  featureName?: string
  appId?: string
}

type MaestroStep =
  | { kind: 'launchApp' }
  | { kind: 'tapOn'; text: string }
  | { kind: 'inputText'; text: string }
  | { kind: 'assertVisible'; text: string }
  | { kind: 'assertNotVisible'; text: string }
  | { kind: 'swipe'; direction: string }
  | { kind: 'openLink'; url: string }
  | { kind: 'scrollUntilVisible'; text: string }
  | { kind: 'takeScreenshot'; name: string }

/** Escape a value for double-quoted YAML. */
function yamlString(value: string): string {
  return '"' + value.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"'
}

/** First double-quoted string in a line, if any. */
function quotedText(line: string): string | null {
  const m = line.match(/"([^"]+)"/)
  return m ? m[1] : null
}

/** Strip keyword prefixes, articles, and trailing punctuation for assertion text. */
function cleanPhrase(rest: string): string {
  return rest
    .replace(/^the\s+/i, '')
    .replace(/^a\s+/i, '')
    .replace(/^an\s+/i, '')
    .replace(/^for\s+the\s+/i, '')
    .replace(/[.!?]+$/, '')
    .trim()
}

function parseWhen(line: string): MaestroStep | null {
  const lower = line.toLowerCase()
  const quote = quotedText(line)

  if (/take[s]? a screenshot|take[s]? screenshot/i.test(line)) {
    return { kind: 'takeScreenshot', name: 'step' }
  }

  const swipeM = line.match(/swipe(?:s|d)?\s+(up|down|left|right)/i)
  if (swipeM) return { kind: 'swipe', direction: swipeM[1].toUpperCase() }

  const openM = line.match(/open(?:s|ed)?\s+(?:the\s+)?(?:deep\s+link|link|url)\s+(.+)$/i)
  if (openM) {
    const url = quote || cleanPhrase(openM[1])
    if (url) return { kind: 'openLink', url }
  }

  const scrollM = line.match(/scroll(?:s)?\s+(?:until|to|down\s+until)\s+(.+)$/i)
  if (scrollM) {
    const target = quote || cleanPhrase(scrollM[1].replace(/\s+is\s+visible$/i, ''))
    if (target) return { kind: 'scrollUntilVisible', text: target }
  }

  // tap / press / click — but not lines that are really about text input
  if (!/input|type|enter|fill/i.test(lower)) {
    const tapM = line.match(/(?:tap(?:s|ped)?|press(?:es|ed)?|click(?:s|ed)?)\s+(?:on\s+)?(?:the\s+)?(.+)$/i)
    if (tapM) {
      const target = quote || cleanPhrase(tapM[1])
      if (target) return { kind: 'tapOn', text: target }
    }
  }

  // Quoted value, or the trailing phrase; an optional "into <field>" tail is
  // consumed so it never lands in the typed text.
  const inputM = line.match(/(?:type|types|typed|enter|enters|entered|input|inputs|fill|fills)\b\s*("([^"]+)"|.+?)(?:\s+(?:into|in|to)\s+.*)?$/i)
  if (inputM) {
    const target = inputM[2] || cleanPhrase(inputM[1])
    if (target) return { kind: 'inputText', text: target }
  }
  return null
}

function parseThen(line: string): MaestroStep | null {
  const lower = line.toLowerCase()
  const quote = quotedText(line)

  // "does not see X" → object after the verb
  const notM = line.match(/(?:does\s+not|do\s+not|should\s+not)\s+(?:see|sees|show|shows|display|displays)\s+(?:the\s+|a\s+|an\s+)?(.+)$/i)
  // "X is not visible / shown / displayed" → subject before the phrase
  const notVisibleM = line.match(/(?:^|[\s:])([^.!?]+?)\s+(?:is\s+|are\s+)?not\s+(?:visible|shown|displayed|present)(?:$|[\s.])/i)
  if (notM || notVisibleM || /absent|gone|hidden|disappear|no longer/i.test(lower)) {
    const target = quote || cleanPhrase((notM ? notM[1] : notVisibleM ? notVisibleM[1] : ''))
    if (target) return { kind: 'assertNotVisible', text: target }
  }

  // "sees X" → object after the verb
  const seeM = line.match(/(?:see|sees|shows?|displays?)\s+(?:the\s+|a\s+|an\s+)?(.+)$/i)
  if (seeM) {
    const target = quote || cleanPhrase(seeM[1])
    if (target) return { kind: 'assertVisible', text: target }
  }

  // "X is displayed / shown / visible / appears / renders" → subject before the verb
  const shownM = line.match(/(?:^|[\s:])([^.!?]+?)\s+(?:is\s+displayed|is\s+shown|is\s+visible|appears?|renders?)(?:$|[\s.])/i)
  if (shownM) {
    const target = quote || cleanPhrase(shownM[1])
    if (target) return { kind: 'assertVisible', text: target }
  }
  return null
}

function parseGiven(line: string): MaestroStep | null {
  if (/open(?:s|ed)?\s+(?:the\s+)?(?:app|application)|launch(?:es|ed)?|start(?:s|ed)?\s+(?:the\s+)?app/i.test(line)) {
    return { kind: 'launchApp' }
  }
  const quote = quotedText(line)
  if (quote) return { kind: 'assertVisible', text: quote }
  return null
}

/** Convert an acceptance-criteria line into a Maestro step, or null if unmappable. */
export function criteriaLineToStep(line: string): MaestroStep | null {
  const trimmed = line.trim()
  if (!trimmed) return null
  if (/^(#{1,6}\s|\*\*|---|[-•]?\s*$)/.test(trimmed)) return null

  if (/^given\b/i.test(trimmed)) return parseGiven(trimmed.replace(/^given\b[\s:]*/i, ''))
  if (/^when\b/i.test(trimmed)) return parseWhen(trimmed.replace(/^when\b[\s:]*/i, ''))
  if (/^then\b/i.test(trimmed)) return parseThen(trimmed.replace(/^then\b[\s:]*/i, ''))
  if (/^(and|but)\b/i.test(trimmed)) {
    const rest = trimmed.replace(/^(and|but)\b[\s:]*/i, '')
    return parseWhen(rest) || parseThen(rest)
  }
  // Unmarked bullet: try action verbs, then visibility, then a plain assertion.
  return parseWhen(trimmed) || parseThen(trimmed)
}

/** Render parsed steps as Maestro YAML lines (excluding the header). */
export function renderMaestroSteps(steps: MaestroStep[]): string[] {
  const lines: string[] = []
  for (const step of steps) {
    switch (step.kind) {
      case 'launchApp':
        lines.push('- launchApp')
        break
      case 'tapOn':
        lines.push(`- tapOn: ${yamlString(step.text)}`)
        break
      case 'inputText':
        lines.push(`- inputText: ${yamlString(step.text)}`)
        break
      case 'assertVisible':
        lines.push(`- assertVisible: ${yamlString(step.text)}`)
        break
      case 'assertNotVisible':
        lines.push(`- assertNotVisible: ${yamlString(step.text)}`)
        break
      case 'swipe':
        lines.push(`- swipe:\n    direction: ${step.direction}`)
        break
      case 'openLink':
        lines.push(`- openLink: ${yamlString(step.url)}`)
        break
      case 'scrollUntilVisible':
        lines.push(`- scrollUntilVisible:\n    element:\n      text: ${yamlString(step.text)}`)
        break
      case 'takeScreenshot':
        lines.push(`- takeScreenshot: ${step.name}`)
        break
    }
  }
  return lines
}

export class MaestroFlowWriter {
  /**
   * Generate a complete Maestro flow YAML from acceptance criteria text.
   * Falls back to a launch + feature-name assertion when nothing maps.
   */
  writeFlow(acceptanceCriteria: string, options: MaestroFlowOptions = {}): string {
    const featureName = options.featureName || 'Feature'
    const appId = options.appId || 'com.example.app'

    const steps: MaestroStep[] = []
    let launchAdded = false

    for (const rawLine of acceptanceCriteria.split('\n')) {
      const step = criteriaLineToStep(rawLine)
      if (!step) continue
      if (step.kind === 'launchApp') launchAdded = true
      steps.push(step)
    }

    if (!launchAdded) {
      steps.unshift({ kind: 'launchApp' })
    }
    // Screenshot the final state so verification can attach it to the PR.
    steps.push({ kind: 'takeScreenshot', name: featureName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'final' })

    const body = renderMaestroSteps(steps)
    return [`appId: ${yamlString(appId)}`, '---', ...body, ''].join('\n')
  }
}
