"use strict";
/**
 * iOS — platform profile definition
 * Business Source License 1.1 (BSL-1.1)
 *
 * Covers Xcode, CocoaPods, Swift Package Manager, iOS SDK,
 * and platform-specific rules for Objective-C/Swift files.
 *
 * Register into a PlatformProfileRegistry:
 *   registry.register(iosDefinition, 'rn')
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.iosDefinition = void 0;
exports.iosDefinition = {
    id: 'ios',
    name: 'iOS',
    version: '17.x',
    sdk: 'iOS SDK 17',
    buildSystem: 'xcodebuild',
    packageManagers: ['cocoapods', 'spm'],
    runtime: 'hermes',
    fileExtensions: ['.swift', '.m', '.h', '.mm', '.pch', '.xib', '.storyboard', '.plist'],
    supportedArchitectures: ['arm64', 'x86_64'],
    rules: [
        {
            id: 'IOS-BUILD-001',
            version: '1.0.0',
            name: 'Use recommended Xcode build settings',
            description: 'Enable Clang analyzer, address sanitizer in debug, and enable modules.',
            severity: 'warning',
            category: 'compatibility',
            appliesTo: ['*.pbxproj', '*.xcconfig'],
            detection: { type: 'build-config', buildSystem: 'xcodebuild', filePattern: '*.pbxproj', checkDescription: 'Enable Clang analyzer and modules' },
            check: () => [],
        },
        {
            id: 'IOS-COCOA-001',
            version: '1.0.0',
            name: 'Pin CocoaPods versions',
            description: 'Always specify exact versions or pessimistic constraints for CocoaPods dependencies.',
            severity: 'warning',
            category: 'compatibility',
            appliesTo: ['Podfile'],
            detection: { type: 'build-config', buildSystem: 'cocoapods', filePattern: 'Podfile', checkDescription: 'All pods must have pinned versions' },
            check: () => [],
        },
        {
            id: 'IOS-SWIFT-001',
            version: '1.0.0',
            name: 'Prefer Swift over Objective-C for new code',
            description: 'New modules and files should use Swift. Objective-C is acceptable only for C interop.',
            severity: 'info',
            category: 'architecture',
            appliesTo: ['*.swift', '*.m'],
            check: () => [],
        },
        {
            id: 'IOS-MEM-001',
            version: '1.0.0',
            name: 'Avoid retain cycles in closures',
            description: 'Use [weak self] or [unowned self] in closures that capture self.',
            severity: 'error',
            category: 'correctness',
            appliesTo: ['*.swift', '*.m', '*.mm'],
            detection: { type: 'regex', pattern: String.raw `\{\s*self\s+in`, matchMeaning: 'violate' },
            check: () => [],
        },
        {
            id: 'IOS-PERF-001',
            version: '1.0.0',
            name: 'Avoid main-thread blocking',
            description: 'Long-running work must be dispatched to background queues. Use @Sendable or dispatch queues.',
            severity: 'error',
            category: 'performance',
            appliesTo: ['*.swift', '*.m'],
            check: () => [],
        },
    ],
    config: {
        deploymentTarget: '15.0',
        swiftVersion: '5.9',
        enableModules: true,
        enableAddressSanitizer: false,
    },
};
