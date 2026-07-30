export class DebugAnalyzer {
  analyzeError(errorMessage: string, projectContext?: string): {
    category: string
    probableCause: string
    suggestions: string[]
  } {
    const lower = errorMessage.toLowerCase()

    if (lower.includes('unable to resolve') || lower.includes('module not found')) {
      return {
        category: 'module-resolution',
        probableCause: 'Missing or misconfigured import path',
        suggestions: [
          'Check that the module is installed: npm install <package>',
          'Verify the import path is correct',
          'Clear metro cache: npx react-native start --reset-cache',
          'Check metro.config.js for resolver configuration',
        ],
      }
    }

    if (lower.includes('null is not an object') || lower.includes('undefined is not an object')) {
      return {
        category: 'null-reference',
        probableCause: 'Accessing property on null/undefined value',
        suggestions: [
          'Add optional chaining: object?.property',
          'Use default values: const { prop = defaultValue } = object',
          'Check that asynchronous data has loaded before rendering',
          'Verify API response shape matches expected types',
        ],
      }
    }

    if (lower.includes('invariant violation')) {
      return {
        category: 'invariant-violation',
        probableCause: 'React Native invariant check failed',
        suggestions: [
          'Check if a required provider is wrapping the component tree',
          'Verify navigation container is set up correctly',
          'Ensure all required props are passed to the component',
          'Check for duplicate navigation screens or routes',
        ],
      }
    }

    if (lower.includes('pod') || lower.includes('xcode') || lower.includes('native build')) {
      return {
        category: 'native-build',
        probableCause: 'iOS native build failure',
        suggestions: [
          'cd ios && pod install --repo-update',
          'Clean build folder: npx react-native clean',
          'Check Xcode version compatibility',
          'Verify CocoaPods version: pod --version',
        ],
      }
    }

    return {
      category: 'unknown',
      probableCause: 'Could not automatically categorize this error',
      suggestions: [
        'Check the full error stack trace',
        'Look for the earliest error in the log',
        'Verify recent changes to see what might have caused it',
      ],
    }
  }
}
