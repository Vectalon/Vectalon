export class LintFixer {
  categorizeLintError(message: string): {
    rule: string
    severity: 'error' | 'warning'
    suggestedFix: string
  } | null {
    const lower = message.toLowerCase()

    if (lower.includes('missing dependency') || lower.includes('react-hooks/exhaustive-deps')) {
      return {
        rule: 'react-hooks/exhaustive-deps',
        severity: 'warning',
        suggestedFix: 'Add missing dependencies to the useEffect/useCallback dependency array',
      }
    }

    if (lower.includes('no-unused-vars') || lower.includes('unused variable') || lower.includes('is defined but never used')) {
      return {
        rule: 'no-unused-vars',
        severity: 'warning',
        suggestedFix: 'Remove the unused variable or use it in the component',
      }
    }

    if (lower.includes('no-console')) {
      return {
        rule: 'no-console',
        severity: 'warning',
        suggestedFix: 'Replace console.log with a proper logging mechanism or remove it',
      }
    }

    if (lower.includes('prefer-const')) {
      return {
        rule: 'prefer-const',
        severity: 'warning',
        suggestedFix: 'Change let to const if the variable is never reassigned',
      }
    }

    if (lower.includes('hooks') && lower.includes('condition')) {
      return {
        rule: 'rules-of-hooks',
        severity: 'error',
        suggestedFix: 'Move React hooks to the top level of the component — never call hooks inside conditions, loops, or nested functions',
      }
    }

    if (lower.includes('import') && lower.includes('order')) {
      return {
        rule: 'import/order',
        severity: 'warning',
        suggestedFix: 'Reorganize imports: external packages first, then internal modules, separated by a blank line',
      }
    }

    return null
  }
}
