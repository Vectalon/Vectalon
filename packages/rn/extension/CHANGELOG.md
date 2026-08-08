# Changelog

All notable changes to the Vectalon VS Code extension.

The extension version always mirrors the `rn-vectalon` npm release, and it
auto-exposes every MCP tool the CLI ships over the `vectalon serve` HTTP
surface — so a new backend capability in the harness usually shows up in the
IDE without an extension change. The full `rn-vectalon` history lives in the
[repository changelog](../../CHANGELOG.md); this file tracks the extension
itself for the Marketplace **Changelog** tab.

## [0.1.11] - 2026-08-07

- The extension now exposes the harness's **Metro-aware execution sandbox**
  (`render_component` — compile + headless-render generated TS/TSX and read
  console logs, render tree, and runtime errors before applying a diff).
- Also surfaced: the sandboxed code-execution tools (`sandbox_run`,
  `sandbox_backend`) from the V-1 trust foundation, `analyze_hermes_profile`
  for runtime performance findings, and the `plan_upgrade` / `apply_upgrade`
  / `detect_upgrade_state` upgrade-copilot tools.
- The Knowledge Base sidebar and inline guardrail diagnostics are unchanged —
  they pick up the richer tool surface automatically through the MCP server.

## [0.1.0] - 2026-07-31

- Initial Marketplace release: `vectalon` — project-aware React Native
  workflows, inline guardrail status, and the team knowledge base.
- Auto-start / stop of the background `vectalon serve` MCP server
  (`vectalon.autoStart`), guardrails on save with Problems-panel diagnostics
  and a live `✓ / ✗` status bar summary, a Knowledge Base sidebar grouped by
  artifact type, and nine command-palette workflows (run feature workflow,
  review code, check guardrails, generate component, project context, search
  and refresh knowledge, start / stop the server).
