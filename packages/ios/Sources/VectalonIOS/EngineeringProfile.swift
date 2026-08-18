/**
 * EngineeringProfile — Swift adapter for the Core EngineeringProfile contract.
 * Business Source License 1.1 (BSL-1.1)
 * © 2026 Vectalon. Commercial use requires a paid license.
 *
 * This module mirrors the canonical JSON Schema defined in Core's
 * `engineering-profile.schema.json`. Swift types are generated from
 * the contract for cross-language consistency.
 *
 * Usage:
 *   let profile = try EngineeringProfile.load(from: jsonData)
 *   let validation = profile.validate()
 *   guard validation.valid else { ... }
 */

import Foundation

// MARK: - EngineeringProfile

/// The central composable specialization abstraction.
/// Mirrors `EngineeringProfile` from Core (`@vectalon-dev/core`).
public struct EngineeringProfile: Codable, Sendable {
    public let id: String
    public let version: String
    public let schemaVersion: Int
    public let language: LanguageProfile
    public let framework: FrameworkProfile?
    public let platforms: [PlatformProfile]?
    public let project: ProjectProfile?
    public let organization: OrganizationProfile?
    public let rules: [EngineeringRule]
    public let guardrails: GuardrailSet
    public let tools: [ToolDefinition]
    public let metadata: ProfileMetadata?

    /// Current schema version — must match Core's `CURRENT_SCHEMA_VERSION`.
    public static let currentSchemaVersion = 1

    /// Validate this profile against the canonical contract.
    public func validate() -> ValidationResult {
        var errors: [ValidationError] = []

        if id.isEmpty {
            errors.append(ValidationError(path: "id", message: "Profile id is required", severity: .error))
        }
        if version.isEmpty {
            errors.append(ValidationError(path: "version", message: "Profile version is required", severity: .error))
        }
        if schemaVersion < 1 {
            errors.append(ValidationError(path: "schemaVersion", message: "schemaVersion must be >= 1", severity: .error))
        }
        if language.id.isEmpty {
            errors.append(ValidationError(path: "language.id", message: "LanguageProfile.id is required", severity: .error))
        }
        if language.name.isEmpty {
            errors.append(ValidationError(path: "language.name", message: "LanguageProfile.name is required", severity: .error))
        }

        // Check rule uniqueness
        var ruleIds = Set<String>()
        for rule in rules {
            if rule.id.isEmpty {
                errors.append(ValidationError(path: "rules", message: "All rules must have an id", severity: .error))
            } else if ruleIds.contains(rule.id) {
                errors.append(ValidationError(path: "rules.\(rule.id)", message: "Duplicate rule id: \(rule.id)", severity: .error))
            } else {
                ruleIds.insert(rule.id)
            }
        }

        // Check tool uniqueness
        var toolIds = Set<String>()
        for tool in tools {
            if tool.id.isEmpty {
                errors.append(ValidationError(path: "tools", message: "All tools must have an id", severity: .error))
            } else if toolIds.contains(tool.id) {
                errors.append(ValidationError(path: "tools.\(tool.id)", message: "Duplicate tool id: \(tool.id)", severity: .error))
            } else {
                toolIds.insert(tool.id)
            }
        }

        let hasErrors = errors.contains { $0.severity == .error }
        return ValidationResult(valid: !hasErrors, errors: errors)
    }

    /// Serialize to JSON Data.
    public func toJSON() throws -> Data {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        return try encoder.encode(self)
    }

    /// Deserialize from JSON Data.
    public static func fromJSON(_ data: Data) throws -> EngineeringProfile {
        let decoder = JSONDecoder()
        return try decoder.decode(EngineeringProfile.self, from: data)
    }

    /// Load from a file URL.
    public static func load(from url: URL) throws -> EngineeringProfile {
        let data = try Data(contentsOf: url)
        return try fromJSON(data)
    }
}

// MARK: - LanguageProfile

public struct LanguageProfile: Codable, Sendable {
    public let id: String
    public let name: String
    public let version: String?
    public let rules: [String]?
    public let fileExtensions: [String]?
    public let parser: String?
    public let features: LanguageFeatures
    public let antiPatterns: [AntiPattern]?
    public let idioms: [String]?
    public let config: [String: AnyCodable]?

    enum CodingKeys: String, CodingKey {
        case id, name, version, rules, fileExtensions, parser, features, antiPatterns, idioms, config
    }
}

public struct LanguageFeatures: Codable, Sendable {
    public let typing: TypingMode
    public let concurrency: ConcurrencyModel
    public let errorHandling: ErrorHandlingModel
    public let moduleSystem: ModuleSystem
    public let nullSafety: NullSafety?
    public let generics: Bool?
    public let patternMatching: Bool?

    public enum TypingMode: String, Codable, Sendable {
        case static, dynamic, gradual, inferred
    }
    public enum ConcurrencyModel: String, Codable, Sendable {
        case asyncAwait = "async-await"
        case threads, actors, goroutines
        case eventLoop = "event-loop"
        case none
    }
    public enum ErrorHandlingModel: String, Codable, Sendable {
        case exceptions
        case resultCode = "result-type"
        case errorCode = "error-codes"
        case optionType = "option-type"
        case mixed
    }
    public enum ModuleSystem: String, Codable, Sendable {
        case esm, commonjs, importmap, mixed
    }
    public enum NullSafety: String, Codable, Sendable {
        case yes, no, optional
    }
}

// MARK: - FrameworkProfile

public struct FrameworkProfile: Codable, Sendable {
    public let id: String
    public let name: String
    public let version: String?
    public let language: String?
    public let inherits: String?
    public let rules: [EngineeringRule]?
    public let lifecycle: [String]?
    public let patterns: [String]?
    public let pitfalls: [AntiPattern]?
    public let config: [String: AnyCodable]?
}

// MARK: - PlatformProfile

public struct PlatformProfile: Codable, Sendable {
    public let id: String
    public let name: String
    public let version: String?
    public let sdk: String?
    public let buildSystem: String?
    public let packageManagers: [String]?
    public let runtime: String?
    public let fileExtensions: [String]?
    public let rules: [EngineeringRule]?
    public let supportedArchitectures: [String]?
    public let config: [String: AnyCodable]?
}

// MARK: - ProjectProfile

public struct ProjectProfile: Codable, Sendable {
    public let name: String
    public let version: String?
    public let language: String
    public let framework: String?
    public let platform: String?
    public let dependencies: [String: String]
    public let devDependencies: [String: String]?
    public let features: [String]?
    public let constraints: [ProjectConstraint]?
}

public struct ProjectConstraint: Codable, Sendable {
    public let id: String
    public let description: String
    public let severity: Severity
}

// MARK: - OrganizationProfile

public struct OrganizationProfile: Codable, Sendable {
    public let id: String
    public let name: String?
    public let policies: [OrgPolicy]
    public let config: [String: AnyCodable]?
}

public struct OrgPolicy: Codable, Sendable {
    public let id: String
    public let rule: String
    public let severity: Severity
    public let appliesTo: [String]?
    public let detectable: Bool
}

// MARK: - EngineeringRule

public struct EngineeringRule: Codable, Sendable {
    public let id: String
    public let version: String
    public let name: String
    public let severity: Severity
    public let category: RuleCategory
    public let description: String
    public let appliesTo: [String]?
    public let tags: [String]?
    public let docs: String?
    public let autoFixable: Bool?

    public enum Severity: String, Codable, Sendable {
        case info, warning, error, block
    }
    public enum RuleCategory: String, Codable, Sendable {
        case style, architecture, security, performance, compatibility, correctness
    }
}

// MARK: - GuardrailSet

public struct GuardrailSet: Codable, Sendable {
    public let rules: [EngineeringRule]
    public let onViolation: OnViolation?
    public let config: [String: AnyCodable]?

    public enum OnViolation: String, Codable, Sendable {
        case block, warn, log
    }
}

// MARK: - ToolDefinition

public struct ToolDefinition: Codable, Sendable {
    public let id: String
    public let name: String
    public let description: String
    public let inputSchema: [String: AnyCodable]
    public let outputSchema: [String: AnyCodable]?
    public let dangerous: Bool?
}

// MARK: - Metadata

public struct ProfileMetadata: Codable, Sendable {
    public let createdAt: String?
    public let updatedAt: String?
    public let author: String?
    public let description: String?
    public let tags: [String]?
}

// MARK: - Validation

public struct ValidationResult: Sendable {
    public let valid: Bool
    public let errors: [ValidationError]
}

public struct ValidationError: Sendable {
    public let path: String
    public let message: String
    public let severity: Severity

    public enum Severity: String, Sendable {
        case error, warning
    }
}

// MARK: - AnyCodable (type-erased Codable)

/// A type-erased Codable value for dictionaries with heterogeneous value types.
/// Mirrors `Record<string, unknown>` in TypeScript.
public enum AnyCodable: Codable, Sendable {
    case string(String)
    case int(Int)
    case double(Double)
    case bool(Bool)
    case array([AnyCodable])
    case dictionary([String: AnyCodable])
    case null

    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() {
            self = .null
        } else if let v = try? container.decode(Bool.self) {
            self = .bool(v)
        } else if let v = try? container.decode(Int.self) {
            self = .int(v)
        } else if let v = try? container.decode(Double.self) {
            self = .double(v)
        } else if let v = try? container.decode(String.self) {
            self = .string(v)
        } else if let v = try? container.decode([AnyCodable].self) {
            self = .array(v)
        } else if let v = try? container.decode([String: AnyCodable].self) {
            self = .dictionary(v)
        } else {
            self = .null
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .string(let v): try container.encode(v)
        case .int(let v): try container.encode(v)
        case .double(let v): try container.encode(v)
        case .bool(let v): try container.encode(v)
        case .array(let v): try container.encode(v)
        case .dictionary(let v): try container.encode(v)
        case .null: try container.encodeNil()
        }
    }
}
