export interface AccessibilityFinding {
  severity: 'error' | 'warning' | 'info'
  rule: string
  message: string
  line: number
}

const TOUCHABLE_TAGS = ['TouchableOpacity', 'TouchableHighlight', 'TouchableWithoutFeedback', 'Pressable']

export class AccessibilityChecker {
  check(code: string, _language = 'tsx'): AccessibilityFinding[] {
    const findings: AccessibilityFinding[] = []
    const lines = code.split('\n')

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const number = i + 1

      if (/<Image[\s/>]/.test(line) && !line.includes('accessibilityLabel')) {
        findings.push({
          severity: 'error',
          rule: 'image-no-label',
          message: '<Image> requires an accessibilityLabel for screen readers.',
          line: number,
        })
      }
      for (const tag of TOUCHABLE_TAGS) {
        if (new RegExp(`<${tag}[\\s/>]`).test(line) && !line.includes('accessibilityRole')) {
          findings.push({
            severity: 'warning',
            rule: 'touchable-no-role',
            message: `<${tag}> should declare an accessibilityRole (e.g. button).`,
            line: number,
          })
        }
      }
      if (/<TextInput[\s/>]/.test(line) && !line.includes('accessibilityLabel') && !line.includes('placeholder')) {
        findings.push({
          severity: 'warning',
          rule: 'textinput-no-label',
          message: '<TextInput> should provide an accessibilityLabel or placeholder.',
          line: number,
        })
      }
    }

    return findings
  }

  render(findings: AccessibilityFinding[]): string {
    const lines = [
      'Accessibility Check',
      '===================',
      '',
      findings.length === 0
        ? 'No findings — accessible code.'
        : `${findings.length} finding${findings.length === 1 ? '' : 's'}`,
      '',
      ...findings.map(f => [
        `[${f.severity}] ${f.rule} (line ${f.line})`,
        `  ${f.message}`,
        '',
      ]).flat(),
    ]
    return lines.join('\n')
  }
}
