/**
 * EngineeringProfileTest — unit tests for the Android profile adapter.
 * Business Source License 1.1 (BSL-1.1)
 * © 2026 Vectalon. Commercial use requires a paid license.
 */

package dev.vectalon.profiles

import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonPrimitive
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

class EngineeringProfileTest {

    private fun makeLanguage() = LanguageProfile(
        id = "kotlin",
        name = "Kotlin",
        version = "1.9",
        fileExtensions = listOf(".kt", ".kts"),
        features = LanguageFeatures(
            typing = TypingMode.STATIC,
            concurrency = ConcurrencyModel.ASYNC_AWAIT,
            errorHandling = ErrorHandlingModel.EXCEPTIONS,
            moduleSystem = ModuleSystem.ESM,
            nullSafety = NullSafety.YES,
            generics = true,
            patternMatching = true,
        ),
    )

    private fun makeRule(id: String) = EngineeringRule(
        id = id,
        name = "Rule $id",
        severity = Severity.WARNING,
        category = RuleCategory.CORRECTNESS,
        description = "Description for $id",
    )

    private fun makeProfile() = EngineeringProfile(
        id = "test-profile",
        version = "1.0.0",
        schemaVersion = EngineeringProfile.CURRENT_SCHEMA_VERSION,
        language = makeLanguage(),
        rules = listOf(makeRule("R1")),
        guardrails = GuardrailSet(emptyList()),
        tools = emptyList(),
    )

    @Test
    fun `validates a correct profile`() {
        val result = makeProfile().validate()
        assertTrue(result.valid)
        assertTrue(result.errors.isEmpty())
    }

    @Test
    fun `rejects empty id`() {
        val profile = makeProfile().copy(id = "")
        val result = profile.validate()
        assertFalse(result.valid)
        assertTrue(result.errors.any { it.path == "id" })
    }

    @Test
    fun `rejects empty language id`() {
        val lang = makeLanguage().copy(id = "")
        val profile = makeProfile().copy(language = lang)
        val result = profile.validate()
        assertFalse(result.valid)
        assertTrue(result.errors.any { it.path == "language.id" })
    }

    @Test
    fun `rejects duplicate rule ids`() {
        val profile = makeProfile().copy(rules = listOf(makeRule("R1"), makeRule("R1")))
        val result = profile.validate()
        assertFalse(result.valid)
        assertTrue(result.errors.any { it.path == "rules.R1" })
    }

    @Test
    fun `rejects duplicate tool ids`() {
        val tool = ToolDefinition(
            id = "T1",
            name = "Tool",
            description = "desc",
            inputSchema = emptyMap(),
        )
        val profile = makeProfile().copy(tools = listOf(tool, tool))
        val result = profile.validate()
        assertFalse(result.valid)
        assertTrue(result.errors.any { it.path == "tools.T1" })
    }

    @Test
    fun `serializes and deserializes`() {
        val json = makeProfile().toJson()
        val restored = EngineeringProfile.fromJson(json)

        assertEquals("test-profile", restored.id)
        assertEquals("1.0.0", restored.version)
        assertEquals("kotlin", restored.language.id)
        assertEquals(1, restored.rules.size)
    }

    @Test
    fun `serializes to JsonObject`() {
        val obj = makeProfile().toJsonObject()
        assertNotNull(obj["id"])
        assertNotNull(obj["language"])
    }

    @Test
    fun `handles optional sub-profiles`() {
        val profile = makeProfile().copy(
            framework = FrameworkProfile(
                id = "jetpack-compose",
                name = "Jetpack Compose",
                version = "1.5",
                language = "kotlin",
            ),
            platforms = listOf(
                PlatformProfile(
                    id = "android",
                    name = "Android",
                    sdk = "Android SDK 34",
                    buildSystem = "gradle",
                ),
            ),
            project = ProjectProfile(
                name = "MyApp",
                language = "kotlin",
                dependencies = mapOf("androidx.compose" to "1.5.0"),
            ),
        )

        val result = profile.validate()
        assertTrue(result.valid)
        assertEquals("jetpack-compose", profile.framework?.id)
        assertEquals(1, profile.platforms?.size)
        assertEquals("MyApp", profile.project?.name)
    }

    @Test
    fun `rejects invalid schema version`() {
        val profile = makeProfile().copy(schemaVersion = 0)
        val result = profile.validate()
        assertFalse(result.valid)
        assertTrue(result.errors.any { it.path == "schemaVersion" })
    }

    @Test
    fun `full Android profile round-trip`() {
        val profile = EngineeringProfile(
            id = "android",
            version = "1.0.0",
            schemaVersion = 1,
            language = makeLanguage(),
            framework = FrameworkProfile(
                id = "jetpack-compose",
                name = "Jetpack Compose",
                version = "1.5",
                language = "kotlin",
            ),
            platforms = listOf(
                PlatformProfile(
                    id = "android",
                    name = "Android",
                    version = "14 (API 34)",
                    sdk = "Android SDK 34",
                    buildSystem = "gradle",
                    packageManagers = listOf("gradle"),
                    fileExtensions = listOf(".kt", ".java", ".xml"),
                ),
            ),
            project = ProjectProfile(
                name = "MyApp",
                version = "1.0.0",
                language = "kotlin",
                framework = "jetpack-compose",
                platform = "android",
                dependencies = mapOf(
                    "androidx.compose" to "1.5.0",
                    "kotlinx-coroutines" to "1.7.3",
                ),
            ),
            rules = listOf(
                makeRule("KOTLIN-NULL-001"),
                makeRule("COMPOSE-PERF-001"),
            ),
            guardrails = GuardrailSet(
                rules = listOf(makeRule("ANDROID-PERF-001")),
                onViolation = GuardrailSet.OnViolation.WARN,
            ),
            tools = listOf(
                ToolDefinition(
                    id = "compose-preview",
                    name = "Compose Preview",
                    description = "Generate Compose previews",
                    inputSchema = mapOf("type" to JsonPrimitive("object")),
                ),
            ),
            metadata = ProfileMetadata(
                description = "Android Jetpack Compose profile",
                tags = listOf("android", "compose", "mobile"),
            ),
        )

        // Serialize
        val json = profile.toJson()
        assertTrue(json.isNotEmpty())

        // Deserialize
        val restored = EngineeringProfile.fromJson(json)
        assertEquals(profile.id, restored.id)
        assertEquals(profile.language.id, restored.language.id)
        assertEquals(profile.framework?.id, restored.framework?.id)
        assertEquals(profile.platforms?.size, restored.platforms?.size)
        assertEquals(profile.project?.name, restored.project?.name)
        assertEquals(profile.rules.size, restored.rules.size)
        assertEquals(profile.tools.size, restored.tools.size)
        assertEquals(profile.metadata?.tags, restored.metadata?.tags)

        // Validate
        val validation = restored.validate()
        assertTrue(validation.valid)
    }
}
