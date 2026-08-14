/**
 * vectalon a11y — accessibility scanners (Roadmap Phase 8, item 068)
 * Business Source License 1.1 (BSL-1.1)
 *
 * Line-pinned accessibility checks on RN source: the shared
 * AccessibilityChecker's rules (Image labels, touchable roles, TextInput
 * labels) plus touch-target-size enforcement (the 44×44pt guideline on
 * interactive elements). Deterministic, hermetic-testable.
 */

import { AccessibilityChecker } from '../sdlc/AccessibilityChecker'
import type { A11yFinding, A11ySeverity } from './types'

const checker = new AccessibilityChecker()

const TOUCHABLE_RE = /<(TouchableOpacity|TouchableHighlight|TouchableWithoutFeedback|Pressable)[\s/>]/

/** Interactive elements should meet the 44×44pt minimum touch target. */
function touchTargetSize(file: string, content: string): A11yFinding[] {
  const findings: A11yFinding[] = []
  const lines = content.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!TOUCHABLE_RE.test(line)) continue
    const width = /(?:width|minWidth)\s*:\s*(\d+)/.exec(line)
    const height = /(?:height|minHeight)\s*:\s*(\d+)/.exec(line)
    if (!width || !height) continue
    const w = Number(width[1])
    const h = Number(height[1])
    if (w >= 44 && h >= 44) continue
    findings.push({
      id: 'touch-target-size',
      severity: 'warning',
      file,
      line: i + 1,
      target: `${width[1]}×${height[1]}pt`,
      message: `Touch target on line ${i + 1} is ${width[1]}×${height[1]}pt — below the 44×44pt guideline`,
      suggestion: 'Enlarge the hit area to at least 44×44pt (or add padding / hitSlop so the interactive area meets the guideline).',
    })
  }
  return findings
}

/** Run every a11y scanner over one source file. */
export function scanA11yFile(file: string, content: string): A11yFinding[] {
  const findings: A11yFinding[] = []
  for (const f of checker.check(content)) {
    findings.push({
      id: f.rule,
      severity: f.severity as A11ySeverity,
      file,
      line: f.line,
      target: f.rule,
      message: f.message,
      suggestion: a11ySuggestion(f.rule),
    })
  }
  findings.push(...touchTargetSize(file, content))
  return findings
}

function a11ySuggestion(rule: string): string {
  switch (rule) {
    case 'image-no-label':
      return 'Add accessibilityLabel describing the image content (or accessibilityIgnoresInvertColors for decorative-only images with accessibilityElementsHidden).'
    case 'touchable-no-role':
      return 'Declare accessibilityRole (button, link, tab…) so screen readers announce the element type — a bare Pressable reads as a generic element.'
    case 'textinput-no-label':
      return 'Provide accessibilityLabel or a visible placeholder — without either, screen readers announce an unlabeled field.'
    default:
      return 'Review the flagged element against the platform accessibility guidelines (RN accessibility docs).'
  }
}
