"use strict";
/**
 * Android — platform profile definition
 * Business Source License 1.1 (BSL-1.1)
 *
 * Covers Gradle, Android Gradle Plugin (AGP), Android SDK,
 * Hermes, and platform-specific rules for Kotlin/Java files.
 *
 * Register into a PlatformProfileRegistry:
 *   registry.register(androidDefinition, 'rn')
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.androidDefinition = void 0;
exports.androidDefinition = {
    id: 'android',
    name: 'Android',
    version: '14 (API 34)',
    sdk: 'Android SDK 34',
    buildSystem: 'gradle',
    packageManagers: ['gradle'],
    runtime: 'hermes',
    fileExtensions: ['.kt', '.java', '.xml', '.gradle', '.gradle.kts', '.pro'],
    supportedArchitectures: ['arm64-v8a', 'armeabi-v7a', 'x86_64'],
    rules: [
        {
            id: 'ANDROID-GRADLE-001',
            version: '1.0.0',
            name: 'Use Kotlin DSL for Gradle',
            description: 'Prefer .gradle.kts over .gradle for type-safe build scripts.',
            severity: 'info',
            category: 'style',
            appliesTo: ['*.gradle'],
            detection: { type: 'build-config', buildSystem: 'gradle', filePattern: '*.gradle', checkDescription: 'Check file extension is .gradle.kts not .gradle' },
            check: () => [],
        },
        {
            id: 'ANDROID-AGP-001',
            version: '1.0.0',
            name: 'Keep AGP version current',
            description: 'Use the latest stable Android Gradle Plugin version for security and performance fixes.',
            severity: 'warning',
            category: 'compatibility',
            appliesTo: ['*.gradle.kts', 'libs.versions.toml'],
            check: () => [],
        },
        {
            id: 'ANDROID-MINSDK-001',
            version: '1.0.0',
            name: 'Set appropriate minSdk',
            description: 'minSdk should match the lowest supported device. Use Android Dashboard data to decide.',
            severity: 'warning',
            category: 'compatibility',
            appliesTo: ['*.gradle.kts'],
            check: () => [],
        },
        {
            id: 'ANDROID-JAVA-001',
            version: '1.0.0',
            name: 'Prefer Kotlin over Java for new code',
            description: 'New modules and files should use Kotlin. Java is acceptable only for C interop or legacy.',
            severity: 'info',
            category: 'architecture',
            appliesTo: ['*.kt', '*.java'],
            check: () => [],
        },
        {
            id: 'ANDROID-PERF-001',
            version: '1.0.0',
            name: 'Avoid memory leaks from Context references',
            description: 'Do not hold Activity/Context references in long-lived objects. Use WeakReference or application context.',
            severity: 'error',
            category: 'correctness',
            appliesTo: ['*.kt', '*.java'],
            check: () => [],
        },
        {
            id: 'ANDROID-PROC-001',
            version: '1.0.0',
            name: 'Declare required permissions',
            description: 'All uses of <uses-permission> must be declared in AndroidManifest.xml with justification.',
            severity: 'warning',
            category: 'security',
            appliesTo: ['AndroidManifest.xml'],
            detection: { type: 'regex', pattern: '<uses-permission', matchMeaning: 'comply' },
            check: () => [],
        },
        {
            id: 'ANDROID-R8-001',
            version: '1.0.0',
            name: 'Enable R8 minification for release',
            description: 'enableR8 = true and enableProguard = true for release builds to reduce APK size.',
            severity: 'warning',
            category: 'performance',
            appliesTo: ['*.gradle.kts'],
            detection: { type: 'build-config', buildSystem: 'gradle', filePattern: '*.gradle.kts', checkDescription: 'Check minificationEnabled is true for release' },
            check: () => [],
        },
    ],
    config: {
        compileSdk: 34,
        minSdk: 24,
        targetSdk: 34,
        javaVersion: '17',
        kotlinVersion: '1.9',
    },
};
