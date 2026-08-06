import type { ParsedCrash } from '../knowledge/telemetry'

export interface RootCauseResult {
  bucket: string
  probableCause: string
  investigation: string[]
}

export interface CrashFacts {
  eventId: string
  exceptionType?: string
  release?: string
  environment?: string
  timestamp?: number
  /** Top in-app stack frame locations, used as investigation leads. */
  topFrames: string[]
  /** Number of distinct users this crash instance is attributed to. */
  userCount: number
}

export interface CrashRootCauseResult extends RootCauseResult {
  crashFacts: CrashFacts
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
  {
    bucket: 'native-crash',
    keywords: ['nsinvalidargumentexception', 'sigsegv', 'sigabrt', 'sigbus', 'nullpointerexception', 'java.lang', 'fatal exception', 'libc', 'native crash'],
    cause: 'A native-level crash (platform runtime, native module, or OS signal)',
    steps: [
      'Pull the native crash report (dSYM symbolication on iOS, tombstone/soinfo on Android)',
      'Check recent native module upgrades and their JNI/C++ boundary code',
      'Verify the crash reproduces on the same OS/device class and release',
      'If a third-party native library is implicated, test the previous version',
    ],
  },
  {
    bucket: 'memory-pressure',
    keywords: ['out of memory', 'oom', 'memory pressure', 'allocation failed', 'memory warning', 'low memory', 'jettison'],
    cause: 'The app exceeded available memory (JS heap, images, or native buffers)',
    steps: [
      'Profile heap growth with the Hermes/JS heap snapshot and LeakCanary',
      'Audit large images, list rendering, and unbounded caches',
      'Check for native memory leaks in image/WebView/video libraries',
      'Verify the device/OS version matches the crash reports before tuning',
    ],
  },
  {
    bucket: 'anr',
    keywords: ['anr', 'application not responding', 'not responding', 'input dispatching timed out', 'did not respond'],
    cause: 'The main thread was blocked long enough for the OS to declare the app unresponsive',
    steps: [
      'Look for synchronous work on the JS/main thread (blocking I/O, heavy renders)',
      'Inspect the ANR trace for the blocking frame and lock contention',
      'Move slow work to background threads or defer it out of the render path',
      'Check for infinite loops or deadlocks introduced by the latest release',
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

  /**
   * Data-driven root-cause analysis for a parsed runtime crash. Classifies
   * using the exception type, message, and stack-frame locations, then enriches
   * the investigation with the actual crash facts (release, environment, top
   * in-app frames) instead of generic heuristics alone.
   */
  analyzeCrash(crash: ParsedCrash): CrashRootCauseResult {
    const frameText = crash.frames.map(f => [f.filename, f.function].filter(Boolean).join(' ')).join(' ')
    const evidence = [crash.exceptionType, crash.message, crash.culprit, frameText].filter(Boolean).join(' ')
    const base = this.analyze(evidence)

    const inAppFrames = crash.frames.filter(f => f.inApp !== false)
    const leadFrames = inAppFrames.length > 0 ? inAppFrames : crash.frames
    const topFrames = leadFrames.slice(0, 5).map(f =>
      [f.function || '(anonymous)', [f.filename, f.lineno !== undefined ? `:${f.lineno}` : ''].join('')].filter(Boolean).join(' — ')
    )

    const investigation = [...base.investigation]
    if (crash.release) investigation.unshift(`Check what changed in release ${crash.release}${crash.environment ? ` (${crash.environment})` : ''} — the crash is attributed to it`)
    if (topFrames.length > 0) {
      investigation.push('Investigate the top in-app frames from the report:')
      investigation.push(...topFrames.map(frame => `  - ${frame}`))
    }
    if (crash.fingerprint && crash.fingerprint.length > 0) {
      investigation.push(`Group related reports by fingerprint: ${crash.fingerprint.join(', ')}`)
    }

    return {
      bucket: base.bucket,
      probableCause: crash.exceptionType && crash.message && crash.message !== crash.exceptionType
        ? `${crash.exceptionType}: ${crash.message}`
        : base.probableCause,
      investigation,
      crashFacts: {
        eventId: crash.id,
        exceptionType: crash.exceptionType,
        release: crash.release,
        environment: crash.environment,
        timestamp: crash.timestamp,
        topFrames,
        userCount: crash.user?.id ? 1 : 0,
      },
    }
  }

  /** Render a crash-driven analysis including the runtime facts it was based on. */
  renderCrash(result: CrashRootCauseResult): string {
    const { crashFacts } = result
    const lines = [
      'Crash Root Cause Analysis',
      '=========================',
      '',
      `Event: ${crashFacts.eventId}`,
      ...(crashFacts.exceptionType ? [`Exception: ${crashFacts.exceptionType}`] : []),
      ...(crashFacts.release ? [`Release: ${crashFacts.release}`] : []),
      ...(crashFacts.environment ? [`Environment: ${crashFacts.environment}`] : []),
      ...(crashFacts.timestamp ? [`First seen: ${new Date(crashFacts.timestamp).toISOString()}`] : []),
      '',
      `Bucket: ${result.bucket}`,
      '',
      `Probable cause: ${result.probableCause}`,
      '',
      'Investigation',
      '-------------',
      ...result.investigation.map(s => `- ${s}`),
      '',
    ]
    return lines.join('\n')
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
