/**
 * EngineeringProfile — Kotlin adapter for the Core EngineeringProfile contract.
 * Business Source License 1.1 (BSL-1.1)
 * © 2026 Vectalon. Commercial use requires a paid license.
 *
 * Mirrors the canonical JSON Schema defined in Core's
 * `engineering-profile.schema.json`. Kotlin data classes are generated
 * from the contract for cross-language consistency.
 *
 * Usage:
 *   val profile = EngineeringProfile.fromJson(jsonString)
 *   val validation = profile.validate()
 *   require(validation.valid) { validation.errors.joinToString() }
 */

package dev.vectalon.profiles

import kotlinx.serialization.*
import kotlinx.serialization.json.*

// ─── EngineeringProfile ─────────────────────────────────────────────────

/**
 * The central composable specialization abstraction.
 * Mirrors `EngineeringProfile` from Core (`@vectalon-dev/core`).
 */
@Serializable
data class EngineeringProfile(
    val id: String,
    val version: String,
    val schemaVersion: Int,
    val language: LanguageProfile,
    val framework: FrameworkProfile? = null,
    val platforms: List<PlatformProfile>? = null,
    val project: ProjectProfile? = null,
    val organization: OrganizationProfile? = null,
    val rules: List<EngineeringRule> = emptyList(),
    val guardrails: GuardrailSet = GuardrailSet(emptyList()),
    val tools: List<ToolDefinition> = emptyList(),
    val metadata: ProfileMetadata? = null,
) {
    companion object {
        /** Current schema version — must match Core's CURRENT_SCHEMA_VERSION. */
        const val CURRENT_SCHEMA_VERSION = 1

        private val json = Json {
            ignoreUnknownKeys = true
            prettyPrint = true
            encodeDefaults = true
        }

        fun fromJson(jsonString: String): EngineeringProfile =
            json.decodeFromString(jsonString)

        fun fromJsonObject(jsonObject: JsonObject): EngineeringProfile =
            json.decodeFromJsonObject(jsonObject)
    }

    /** Validate this profile against the canonical contract. */
    fun validate(): ValidationResult {
        val errors = mutableListOf<ValidationError>()

        if (id.isEmpty()) {
            errors.add(ValidationError("id", "Profile id is required", Severity.ERROR))
        }
        if (version.isEmpty()) {
            errors.add(ValidationError("version", "Profile version is required", Severity.ERROR))
        }
        if (schemaVersion < 1) {
            errors.add(ValidationError("schemaVersion", "schemaVersion must be >= 1", Severity.ERROR))
        }
        if (language.id.isEmpty()) {
            errors.add(ValidationError("language.id", "LanguageProfile.id is required", Severity.ERROR))
        }
        if (language.name.isEmpty()) {
            errors.add(ValidationError("language.name", "LanguageProfile.name is required", Severity.ERROR))
        }

        // Rule uniqueness
        val ruleIds = mutableSetOf<String>()
        for (rule in rules) {
            if (rule.id.isEmpty()) {
                errors.add(ValidationError("rules", "All rules must have an id", Severity.ERROR))
            } else if (!ruleIds.add(rule.id)) {
                errors.add(ValidationError("rules.${rule.id}", "Duplicate rule id: ${rule.id}", Severity.ERROR))
            }
        }

        // Tool uniqueness
        val toolIds = mutableSetOf<String>()
        for (tool in tools) {
            if (tool.id.isEmpty()) {
                errors.add(ValidationError("tools", "All tools must have an id", Severity.ERROR))
            } else if (!toolIds.add(tool.id)) {
                errors.add(ValidationError("tools.${tool.id}", "Duplicate tool id: ${tool.id}", Severity.ERROR))
            }
        }

        return ValidationResult(
            valid = errors.none { it.severity == Severity.ERROR },
            errors = errors,
        )
    }

    /** Serialize to JSON string. */
    fun toJson(): String = json.encodeToString(this)

    /** Serialize to JsonObject. */
    fun toJsonObject(): JsonObject = json.encodeToJsonElement(this) as JsonObject
}

// ─── Sub-profiles ───────────────────────────────────────────────────────

@Serializable
data class LanguageProfile(
    val id: String,
    val name: String,
    val version: String? = null,
    val rules: List<String>? = null,
    val fileExtensions: List<String>? = null,
    val parser: String? = null,
    val features: LanguageFeatures,
    val antiPatterns: List<AntiPattern>? = null,
    val idioms: List<String>? = null,
    val config: Map<String, JsonElement>? = null,
)

@Serializable
data class LanguageFeatures(
    val typing: TypingMode,
    val concurrency: ConcurrencyModel,
    val errorHandling: ErrorHandlingModel,
    val moduleSystem: ModuleSystem,
    val nullSafety: NullSafety? = null,
    val generics: Boolean? = null,
    val patternMatching: Boolean? = null,
)

@Serializable
enum class TypingMode { STATIC, DYNAMIC, GRADUAL, INFERRED }

@Serializable
enum class ConcurrencyModel {
    @SerialName("async-await") ASYNC_AWAIT,
    THREADS, ACTORS, GOROUTINES,
    @SerialName("event-loop") EVENT_LOOP,
    NONE
}

@Serializable
enum class ErrorHandlingModel {
    EXCEPTIONS,
    @SerialName("result-type") RESULT_TYPE,
    @SerialName("error-codes") ERROR_CODES,
    @SerialName("option-type") OPTION_TYPE,
    MIXED
}

@Serializable
enum class ModuleSystem { ESM, COMMONJS, IMPORTMAP, MIXED }

@Serializable
enum class NullSafety { YES, NO, OPTIONAL }

@Serializable
data class AntiPattern(
    val id: String,
    val name: String,
    val description: String,
    val severity: Severity,
)

@Serializable
data class FrameworkProfile(
    val id: String,
    val name: String,
    val version: String? = null,
    val language: String? = null,
    val inherits: String? = null,
    val rules: List<EngineeringRule>? = null,
    val lifecycle: List<String>? = null,
    val patterns: List<String>? = null,
    val pitfalls: List<AntiPattern>? = null,
    val config: Map<String, JsonElement>? = null,
)

@Serializable
data class PlatformProfile(
    val id: String,
    val name: String,
    val version: String? = null,
    val sdk: String? = null,
    val buildSystem: String? = null,
    val packageManagers: List<String>? = null,
    val runtime: String? = null,
    val fileExtensions: List<String>? = null,
    val rules: List<EngineeringRule>? = null,
    val supportedArchitectures: List<String>? = null,
    val config: Map<String, JsonElement>? = null,
)

@Serializable
data class ProjectProfile(
    val name: String,
    val version: String? = null,
    val language: String,
    val framework: String? = null,
    val platform: String? = null,
    val dependencies: Map<String, String> = emptyMap(),
    val devDependencies: Map<String, String>? = null,
    val features: List<String>? = null,
    val constraints: List<ProjectConstraint>? = null,
)

@Serializable
data class ProjectConstraint(
    val id: String,
    val description: String,
    val severity: Severity,
)

@Serializable
data class OrganizationProfile(
    val id: String,
    val name: String? = null,
    val policies: List<OrgPolicy> = emptyList(),
    val config: Map<String, JsonElement>? = null,
)

@Serializable
data class OrgPolicy(
    val id: String,
    val rule: String,
    val severity: Severity,
    val appliesTo: List<String>? = null,
    val detectable: Boolean,
)

// ─── Rules & Tools ──────────────────────────────────────────────────────

@Serializable
data class EngineeringRule(
    val id: String,
    val version: String = "1.0.0",
    val name: String,
    val severity: Severity,
    val category: RuleCategory,
    val description: String,
    val appliesTo: List<String>? = null,
    val tags: List<String>? = null,
    val docs: String? = null,
    val autoFixable: Boolean? = null,
)

@Serializable
enum class Severity { INFO, WARNING, ERROR, BLOCK }

@Serializable
enum class RuleCategory {
    STYLE, ARCHITECTURE, SECURITY, PERFORMANCE, COMPATIBILITY, CORRECTNESS
}

@Serializable
data class GuardrailSet(
    val rules: List<EngineeringRule> = emptyList(),
    val onViolation: OnViolation? = null,
    val config: Map<String, JsonElement>? = null,
) {
    @Serializable
    enum class OnViolation { BLOCK, WARN, LOG }
}

@Serializable
data class ToolDefinition(
    val id: String,
    val name: String,
    val description: String,
    val inputSchema: Map<String, JsonElement>,
    val outputSchema: Map<String, JsonElement>? = null,
    val dangerous: Boolean? = null,
)

@Serializable
data class ProfileMetadata(
    val createdAt: String? = null,
    val updatedAt: String? = null,
    val author: String? = null,
    val description: String? = null,
    val tags: List<String>? = null,
)

// ─── Validation ─────────────────────────────────────────────────────────

data class ValidationResult(
    val valid: Boolean,
    val errors: List<ValidationError>,
)

data class ValidationError(
    val path: String,
    val message: String,
    val severity: Severity,
)
