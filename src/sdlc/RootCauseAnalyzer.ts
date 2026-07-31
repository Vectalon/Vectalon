export interface RootCauseResult {
  bucket: string
  probableCause: string
  investigation: string[]
}

interface RootCauseRule {
  bucket: string
  keywords: string[]
  cause: string
  steps: string[]
}

const RULES: RootCauseRule[] = [
  {
    bucket: 'null-reference',
    keywords: ['null is not an object', 'undefined is not an object', 'cannot read property', "can't read property", 'of undefined', 'of null'],
    cause: 'Accessing a property on a nullish value',
    steps: [
      'Add optional chaining or default values',
      'Verify async data is loaded before render',
      'Check the API response shape matches the expected types',
    ],
  },
  {
    bucket: 'module-resolution',
    keywords: ['unable to resolve', 'module not found', 'cannot find module'],
    cause: 'Import path or module is missing or misconfigured',
    steps: [
      'Verify the import path is correct',
      'Install the missing package: npm install <package>',
      'Clear the Metro cache: npx react-native start --reset-cache',
    ],
  },
  {
    bucket: 'permissions',
    keywords: ['permission', 'denied', 'unauthorized', 'access denied'],
    cause: 'OS-level permission not granted or checked',
    steps: [
      'Check platform permission config (Info.plist / AndroidManifest)',
      'Request permission before the user action',
      'Handle the denied case with a clear UI message',
    ],
  },
  {
    bucket: 'native-build',
    keywords: ['pod', 'xcode', 'gradle', 'cocoapods', 'native build'],
    cause: 'A native build step failed',
    steps: [
      'Run pod install --repo-update',
      'Clean the build: npx react-native clean',
      'Check Xcode/CocoaPods/Gradle version compatibility',
    ],
  },
  {
    bucket: 'network',
    keywords: ['network', 'offline', 'timeout', 'time out', 'connection'],
    cause: 'A network request failed or timed out',
    steps: [
      'Check connectivity and retry behaviour',
      'Verify the endpoint URL and auth headers',
      'Inspect server-side logs for the request',
    ],
  },
  {
    bucket: 'configuration',
    keywords: ['config', 'env', 'missing key', 'invalid configuration', 'not set'],
    cause: 'Misconfiguration or missing environment value',
    steps: [
      'Check config and environment keys',
      'Compare against a working environment',
      'Validate feature flags and remote config',
    ],
  },
  {
    bucket: 'state-management',
    keywords: ['stale', 'out of sync', 'out-of-sync'],
    cause: 'Client state drifted from the server or other sources',
    steps: [
      'Refresh state after mutations',
      'Add cache invalidation',
      'Reconcile optimistic updates on failure',
    ],
  },
  {
    bucket: 'async',
    keywords: ['unhandled promise', 'promise', 'race condition'],
    cause: 'Unhandled or racing asynchronous work',
    steps: [
      'Await the promise and catch errors',
      'Serialise dependent async calls',
      'Use a cancellation token where needed',
    ],
  },
]

export class RootCauseAnalyzer {
  analyze(issue: string): RootCauseResult {
    const lower = issue.toLowerCase()
    for (const rule of RULES) {
      if (rule.keywords.some(keyword => lower.includes(keyword))) {
        return { bucket: rule.bucket, probableCause: rule.cause, investigation: rule.steps }
      }
    }
    return {
      bucket: 'unknown',
      probableCause: 'Could not automatically classify this issue',
      investigation: ['Reproduce the issue locally', 'Capture logs and stack traces', 'Trace recent changes that could relate'],
    }
  }

  render(result: RootCauseResult): string {
    return [
      'Root Cause Analysis',
      '===================',
      '',
      `Bucket: ${result.bucket}`,
      '',
      `Probable cause: ${result.probableCause}`,
      '',
      'Investigation',
      '-------------',
      ...result.investigation.map(s => `- ${s}`),
      '',
    ].join('\n')
  }
}
