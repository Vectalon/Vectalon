/**
 * Android Build Analyzer (Roadmap 013) — interpret Gradle failures: a
 * pattern-based log parser that classifies the root cause of the top React
 * Native build errors (SDK/AGP versions, dependency resolution, resource
 * linking, NDK, Java, network) and suggests the standard fix.
 * Business Source License 1.1 (BSL-1.1)
 */
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { reportError } from '../utils/safe'
import type { DiagnosticCheck, LogAnalysis } from './types'

interface GradlePattern {
  id: string
  name: string
  re: RegExp
  fix: string
}

/** The top RN Gradle failures, ordered most-specific first. */
export const GRADLE_PATTERNS: GradlePattern[] = [
  {
    id: 'sdk-platform-not-found',
    name: 'Android SDK platform missing',
    re: /Failed to find target with hash string ['"]android-\d+['"]/i,
    fix: 'Install the missing SDK platform: `sdkmanager "platforms;android-XX"` (match compileSdkVersion in android/build.gradle), or raise compileSdkVersion to an installed API.',
  },
  {
    id: 'compile-sdk-version',
    name: 'compileSdkVersion too low for RN',
    re: /compileSdkVersion|Please use SDK version (3\d|2\d)\d+ or higher/i,
    fix: 'Raise compileSdkVersion in android/build.gradle — React Native requires the SDK level its build.gradle pins (e.g. 35 for RN 0.76+, 34 for 0.73+).',
  },
  {
    id: 'agp-version',
    name: 'Android Gradle Plugin incompatible',
    re: /Minimum supported Gradle version is \d+\.\d+|Android Gradle plugin requires Gradle \d+\.\d+|AGP version|requires Gradle/i,
    fix: 'Bump the Gradle wrapper + AGP together: update gradle/wrapper/gradle-wrapper.properties and the `com.android.tools.build:gradle` version in android/build.gradle to the RN-required pair (see the RN upgrade guide for your version).',
  },
  {
    id: 'dependency-resolution',
    name: 'Dependency resolution failure',
    re: /Could not resolve|Could not find|Failed to resolve|No matching variant/i,
    fix: 'Check the failing dependency: ensure it is published for your ABI/architecture (add `--stacktrace` to see which artifact failed), try `cd android && ./gradlew clean` then re-sync, and verify the package is in settings.gradle / installed from the right registry.',
  },
  {
    id: 'resource-link',
    name: 'Resource linking (AAPT) failure',
    re: /AAPT2? error|resource linking failed|failed to link|duplicate resource/i,
    fix: 'Usually a duplicate or missing resource from a native module: `cd android && ./gradlew clean` and reinstall pods/deps; if a resource is duplicated, find the two packages declaring it and exclude one via packagingOptions.',
  },
  {
    id: 'ndk-version',
    name: 'NDK version mismatch',
    re: /NDK at .* did not have a source.properties file|Unable to locate a Java Runtime|NDK Version/i,
    fix: 'Install the NDK version RN pins (check `ndkVersion` in android/build.gradle): `sdkmanager "ndk;26.1.10909125"` (or the version your RN release requires).',
  },
  {
    id: 'java-version',
    name: 'Java version mismatch',
    re: /Unsupported class file major version|Java home is invalid|Could not determine java version|sourceCompat.*targetCompat/i,
    fix: 'Use the JDK your Gradle/AGP requires (RN 0.73+ needs JDK 17): `brew install --cask zulu@17` and set org.gradle.java.home / JAVA_HOME.',
  },
  {
    id: 'network',
    name: 'Network / registry failure',
    re: /Could not GET ['"][^'"]+|Connection refused|UnknownHost|SSL peer shut down|status 403/i,
    fix: 'Registry or proxy hiccup: retry with `cd android && ./gradlew --refresh-dependencies`, check VPN/proxy, and mirror artifacts via a local maven (settings.gradle maven { url ... }).',
  },
  {
    id: 'memory',
    name: 'Out of memory (Gradle daemon)',
    re: /OutOfMemoryError|GC overhead limit exceeded|Killed/,
    fix: 'Raise the Gradle daemon heap in android/gradle.properties: `org.gradle.jvmargs=-Xmx4g -XX:MaxMetaspaceSize=1g`, then `cd android && ./gradlew --stop`.',
  },
  {
    id: 'hermes-android',
    name: 'Hermes build issue (Android)',
    re: /hermesc|hermes-engine|Could not resolve.*hermes/i,
    fix: 'Hermes bytecode toolchain failed: clean (`cd android && ./gradlew clean`), delete the Gradle cache (`~/.gradle/caches`) for a corrupted hermes-engine artifact, and confirm hermesEnabled matches your RN version (RN 0.70+ defaults to on).',
  },
]

/** Parse a Gradle log and return the root-cause classification. */
export function analyzeGradleLog(log: string): LogAnalysis {
  const matches: LogAnalysis['matches'] = []
  const lines = log.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    for (const pattern of GRADLE_PATTERNS) {
      if (pattern.re.test(line)) {
        matches.push({ id: pattern.id, name: pattern.name, line: i + 1, fix: pattern.fix })
      }
    }
  }
  // Most specific = the first pattern in the ordered table.
  const first = matches[0] ?? null
  const rootCause = first ? { id: first.id, name: first.name, fix: first.fix } : null
  const evidence = lines.filter(l => l.trim()).slice(-25)
  return { rootCause, matches, evidence }
}

/** Read a Gradle log file and analyze it; null when the file is missing. */
export function analyzeGradleLogFile(path: string): LogAnalysis | null {
  try {
    if (!existsSync(path)) return null
    return analyzeGradleLog(readFileSync(path, 'utf-8'))
  } catch (err) {
    reportError(err, `diagnostics: reading gradle log ${path}`)
    return null
  }
}

/** Project-side Gradle checks (no log needed): SDK/NDK/AGP sanity. */
export function gradleProjectChecks(root: string): DiagnosticCheck[] {
  const checks: DiagnosticCheck[] = []
  const buildGradle = join(root, 'android', 'build.gradle')
  const props = join(root, 'android', 'gradle.properties')
  let content = ''
  if (existsSync(buildGradle)) {
    try {
      content = readFileSync(buildGradle, 'utf-8')
    } catch (err) {
      reportError(err, 'diagnostics: reading android/build.gradle')
    }
  }
  const compileMatch = content.match(/compileSdkVersion\s*=\s*(\d+)|compileSdkVersion\s+(\d+)/)
  const compileSdk = compileMatch ? Number(compileMatch[1] || compileMatch[2]) : null
  if (compileSdk !== null) {
    const recommended = compileSdk >= 35 ? 35 : compileSdk >= 34 ? 34 : 33
    checks.push({
      id: 'android-compile-sdk',
      title: 'compileSdkVersion',
      category: 'android',
      status: compileSdk >= recommended ? 'pass' : 'warn',
      detail: `compileSdkVersion = ${compileSdk}` + (compileSdk >= recommended ? ' — at or above the recommended level.' : ` — below the ${recommended} recommended for current React Native releases.`),
      fix: compileSdk >= recommended ? undefined : `Set compileSdkVersion = ${recommended} in android/build.gradle (and install that platform via sdkmanager).`,
    })
  } else if (existsSync(buildGradle)) {
    checks.push({
      id: 'android-compile-sdk',
      title: 'compileSdkVersion',
      category: 'android',
      status: 'info',
      detail: 'Could not read compileSdkVersion from android/build.gradle (newer AGP may use compileSdk in android/app/build.gradle).',
    })
  } else {
    checks.push({
      id: 'android-project',
      title: 'Android project',
      category: 'android',
      status: 'info',
      detail: 'No android/ directory — nothing to analyze on the Android side (Expo managed projects generate it on prebuild).',
    })
  }

  let propsContent = ''
  if (existsSync(props)) {
    try {
      propsContent = readFileSync(props, 'utf-8')
    } catch (err) {
      reportError(err, 'diagnostics: reading android/gradle.properties')
    }
  }
  if (propsContent && !/\sorg\.gradle\.jvmargs=/.test(propsContent)) {
    checks.push({
      id: 'android-gradle-memory',
      title: 'Gradle daemon heap',
      category: 'android',
      status: 'warn',
      detail: 'No org.gradle.jvmargs in android/gradle.properties — big builds risk OutOfMemory.',
      fix: 'Add `org.gradle.jvmargs=-Xmx4g -XX:MaxMetaspaceSize=1g` to android/gradle.properties.',
    })
  }
  return checks
}
