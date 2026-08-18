/**
 * EngineeringProfileTests — unit tests for the iOS profile adapter.
 * Business Source License 1.1 (BSL-1.1)
 * © 2026 Vectalon. Commercial use requires a paid license.
 */

import XCTest
@testable import VectalonIOS

final class EngineeringProfileTests: XCTestCase {

    // MARK: - Fixtures

    private func makeLanguage() -> LanguageProfile {
        LanguageProfile(
            id: "typescript",
            name: "TypeScript",
            version: "5.x",
            rules: nil,
            fileExtensions: [".ts", ".tsx"],
            parser: "typescript-estree",
            features: LanguageFeatures(
                typing: .gradual,
                concurrency: .eventLoop,
                errorHandling: .exceptions,
                moduleSystem: .esm,
                nullSafety: .optional,
                generics: true,
                patternMatching: false
            ),
            antiPatterns: nil,
            idioms: nil,
            config: nil
        )
    }

    private func makeRule(id: String) -> EngineeringRule {
        EngineeringRule(
            id: id,
            version: "1.0.0",
            name: "Rule \(id)",
            severity: .warning,
            category: .correctness,
            description: "Description for \(id)",
            appliesTo: ["*.ts"],
            tags: nil,
            docs: nil,
            autoFixable: nil
        )
    }

    private func makeProfile() -> EngineeringProfile {
        EngineeringProfile(
            id: "test-profile",
            version: "1.0.0",
            schemaVersion: EngineeringProfile.currentSchemaVersion,
            language: makeLanguage(),
            framework: nil,
            platforms: nil,
            project: nil,
            organization: nil,
            rules: [makeRule(id: "R1")],
            guardrails: GuardrailSet(rules: []),
            tools: [],
            metadata: nil
        )
    }

    // MARK: - Validation

    func testValidateCorrectProfile() {
        let profile = makeProfile()
        let result = profile.validate()
        XCTAssertTrue(result.valid)
        XCTAssertTrue(result.errors.isEmpty)
    }

    func testRejectsEmptyId() {
        let profile = EngineeringProfile(
            id: "",
            version: "1.0.0",
            schemaVersion: 1,
            language: makeLanguage(),
            framework: nil,
            platforms: nil,
            project: nil,
            organization: nil,
            rules: [],
            guardrails: GuardrailSet(rules: []),
            tools: [],
            metadata: nil
        )
        let result = profile.validate()
        XCTAssertFalse(result.valid)
        XCTAssertTrue(result.errors.contains { $0.path == "id" })
    }

    func testRejectsEmptyLanguageId() {
        let lang = LanguageProfile(
            id: "",
            name: "Swift",
            version: nil,
            rules: nil,
            fileExtensions: nil,
            parser: nil,
            features: LanguageFeatures(
                typing: .static,
                concurrency: .none,
                errorHandling: .exceptions,
                moduleSystem: .esm
            ),
            antiPatterns: nil,
            idioms: nil,
            config: nil
        )
        let profile = EngineeringProfile(
            id: "test",
            version: "1.0.0",
            schemaVersion: 1,
            language: lang,
            framework: nil,
            platforms: nil,
            project: nil,
            organization: nil,
            rules: [],
            guardrails: GuardrailSet(rules: []),
            tools: [],
            metadata: nil
        )
        let result = profile.validate()
        XCTAssertFalse(result.valid)
        XCTAssertTrue(result.errors.contains { $0.path == "language.id" })
    }

    func testRejectsDuplicateRuleIds() {
        let profile = EngineeringProfile(
            id: "test",
            version: "1.0.0",
            schemaVersion: 1,
            language: makeLanguage(),
            framework: nil,
            platforms: nil,
            project: nil,
            organization: nil,
            rules: [makeRule(id: "R1"), makeRule(id: "R1")],
            guardrails: GuardrailSet(rules: []),
            tools: [],
            metadata: nil
        )
        let result = profile.validate()
        XCTAssertFalse(result.valid)
        XCTAssertTrue(result.errors.contains { $0.path == "rules.R1" })
    }

    func testRejectsDuplicateToolIds() {
        let tool = ToolDefinition(
            id: "T1",
            name: "Tool",
            description: "desc",
            inputSchema: .dictionary([:]),
            outputSchema: nil,
            dangerous: nil
        )
        let profile = EngineeringProfile(
            id: "test",
            version: "1.0.0",
            schemaVersion: 1,
            language: makeLanguage(),
            framework: nil,
            platforms: nil,
            project: nil,
            organization: nil,
            rules: [],
            guardrails: GuardrailSet(rules: []),
            tools: [tool, tool],
            metadata: nil
        )
        let result = profile.validate()
        XCTAssertFalse(result.valid)
        XCTAssertTrue(result.errors.contains { $0.path == "tools.T1" })
    }

    // MARK: - Serialization

    func testSerializeAndDeserializeRoundTrip() throws {
        let profile = EngineeringProfile(
            id: "rn-test",
            version: "1.0.0",
            schemaVersion: 1,
            language: makeLanguage(),
            framework: FrameworkProfile(
                id: "react-native",
                name: "React Native",
                version: "0.82",
                language: "typescript",
                inherits: "react",
                rules: nil,
                lifecycle: ["mount", "update", "unmount"],
                patterns: ["hooks", "context"],
                pitfalls: nil,
                config: nil
            ),
            platforms: [
                PlatformProfile(
                    id: "ios",
                    name: "iOS",
                    version: "17.x",
                    sdk: "iOS SDK 17",
                    buildSystem: "xcodebuild",
                    packageManagers: ["cocoapods"],
                    runtime: "hermes",
                    fileExtensions: [".swift", ".m", ".h"],
                    rules: nil,
                    supportedArchitectures: ["arm64"],
                    config: nil
                ),
            ],
            project: ProjectProfile(
                name: "MyApp",
                version: "1.0.0",
                language: "typescript",
                framework: "react-native",
                platform: "ios",
                dependencies: ["react-native": "0.82.0"],
                devDependencies: nil,
                features: ["typescript", "metro"],
                constraints: nil
            ),
            organization: nil,
            rules: [makeRule(id: "RN-COMP-001")],
            guardrails: GuardrailSet(rules: [makeRule(id: "RN-GUARD-001")], onViolation: .warn),
            tools: [
                ToolDefinition(
                    id: "component-gen",
                    name: "Component Generator",
                    description: "Generate a component",
                    inputSchema: .dictionary(["type": .string("object")]),
                    outputSchema: nil,
                    dangerous: nil
                ),
            ],
            metadata: ProfileMetadata(
                createdAt: nil,
                updatedAt: nil,
                author: nil,
                description: "Test RN profile",
                tags: ["react-native", "mobile"]
            )
        )

        // Serialize
        let data = try profile.toJSON()
        XCTAssertFalse(data.isEmpty)

        // Deserialize
        let restored = try EngineeringProfile.fromJSON(data)
        XCTAssertEqual(restored.id, profile.id)
        XCTAssertEqual(restored.version, profile.version)
        XCTAssertEqual(restored.language.id, profile.language.id)
        XCTAssertEqual(restored.framework?.id, profile.framework?.id)
        XCTAssertEqual(restored.platforms?.count, profile.platforms?.count)
        XCTAssertEqual(restored.project?.name, profile.project?.name)
        XCTAssertEqual(restored.rules.count, profile.rules.count)
        XCTAssertEqual(restored.tools.count, profile.tools.count)
        XCTAssertEqual(restored.metadata?.tags, ["react-native", "mobile"])
    }
}
