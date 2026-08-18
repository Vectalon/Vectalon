# Vectalon Engineering Harness — Architecture Map

This document maps the existing codebase to the target **Engineering Harness** architecture defined in `Vectalon_Engineering_Harness_Architecture.md`.

## 1. Mapping Existing Modules

### Model Provider
*   **Target**: `ModelProvider` abstraction (Model-agnostic).
*   **Existing**:
    *   `packages/rn/src/model/ModelRouter.ts`: Routes requests to providers.
    *   `packages/rn/src/model/providers/`: Contains `RemoteProvider`, `LocalProvider`, `WasmProvider`.
    *   `packages/core/src/model/mode.ts`: Defines deployment modes.
*   **Gap**: The `ModelProvider` interface is currently RN-specific. It needs to be extracted to Core.

### Context Engine
*   **Target**: Assemble language/framework/platform/project context.
*   **Existing**:
    *   `packages/core/src/platform/ContextEngine.ts`: Abstract interface.
    *   `packages/rn/src/harness/ContextEngine.ts`: **Concrete implementation**. Builds rich context (React version, New Architecture, Expo SDK, etc.).
    *   `packages/rn/src/harness/Scanner.ts`: Scans project structure and dependencies.
*   **Gap**: The RN implementation is strong. Core should formalize the `ProjectProfile` part of the `EngineeringProfile`.

### Rules & Guardrails
*   **Target**: Executable, machine-readable rules.
*   **Existing**:
    *   `packages/core/src/platform/GuardrailEngine.ts`: Abstract interface.
    *   `packages/rn/src/guardrails/engine.ts`: Guardrail engine.
    *   `packages/rn/src/guardrails/rules.ts`: RN-specific rules (e.g., deprecated APIs).
    *   `packages/rn/src/guardrails/PolicyEngine.ts`: Likely for organization-specific policies.
*   **Gap**: Rules are currently split. Core should define a standard `RuleSet` format.

### Engineering Profile (New Abstraction)
*   **Target**: `EngineeringProfile { language, framework, platform, project, organization }`.
*   **Existing**:
    *   `packages/rn/src/harness/ContextEngine.ts`: Dynamically builds this info but doesn't export it as a structured `Profile` object.
    *   `packages/core/src/config/VectalonConfig.ts`: Configuration, but not a "Profile".
*   **Gap**: **Major**. We need a structured `EngineeringProfile` that composes `LanguageProfile`, `FrameworkProfile`, etc.

### Tools
*   **Target**: Orchestrate tools for the model.
*   **Existing**:
    *   `packages/rn/src/protocol/`: MCP Server and tool definitions.
    *   `packages/rn/src/sdlc/`: Various "Writers" and "Analyzers" acting as tools.
*   **Gap**: Tool interfaces should be defined in Core to allow cross-platform tool orchestration.

### Memory & Evaluation
*   **Target**: Learning from interactions and validating changes.
*   **Existing**:
    *   `packages/rn/src/memory/`: `ProjectMemory`, `PatternLearner`.
    *   `packages/rn/src/bench/`: Benchmarking suite.
    *   `packages/rn/src/evals/`: Evaluation runner.
*   **Gap**: Memory abstractions should be product-agnostic in Core.

---

## 2. Recommendations

### Reuse
*   **RN `ContextEngine`**: Keep as the gold standard for RN context discovery.
*   **RN `Guardrails`**: Keep the executable rule engine and RN-specific rules.
*   **RN `ModelRouter`**: Keep the routing logic, but abstract the provider interface.

### Rename / Move
*   **Move `ModelProvider` interface to Core**: Define `interface ModelProvider { generate(req): res }` in Core.
*   **Move `Tool` interface to Core**: Standardize tool contracts.
*   **Move `Memory` abstractions to Core**: `PatternStore`, `ProjectMemory` interfaces.

### Delete / Refactor
*   **Core `Scanner` interface**: Rename to `ProjectScanner` to avoid confusion with file-system scanners.
*   **RN `ContextEngine`**: Refactor to output a structured `EngineeringProfile` instead of just a string prompt.

### New Abstractions (Core)
1.  **`EngineeringProfile`**: The central composable profile.
2.  **`LanguageProfile`**: TypeScript, Swift, etc.
3.  **`FrameworkProfile`**: React Native, SwiftUI, etc.
4.  **`PlatformProfile`**: iOS, Android, Web.
5.  **`OrganizationProfile`**: Enforceable policies.

---

## 3. Implementation Plan (Phase 1)

1.  **Define `EngineeringProfile` in Core**: Create `packages/core/src/profile/EngineeringProfile.ts`.
2.  **Abstract `ModelProvider` in Core**: Create `packages/core/src/model/ModelProvider.ts`.
3.  **Refactor RN `ContextEngine`**: Return `EngineeringProfile` from `buildProfile()`.
4.  **Document Contracts**: Use JSON Schema for cross-language contracts (starting with `EngineeringProfile`).

This audit confirms that while Core provides the abstract contracts, the RN package contains the heavy lifting for context and guardrails. The primary task now is to promote these implementations into a structured, composable architecture in Core.
