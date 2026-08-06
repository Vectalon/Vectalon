# Vectalon for VS Code

A thin IDE layer over the [rn-vectalon](https://github.com/Vectalon/rn-vectalon) MCP server. No new backend — the extension talks to `vectalon serve --protocol http` over the same HTTP tool surface the CLI exposes (`GET /tools`, `POST /call`).

## Requirements

- [rn-vectalon](https://github.com/Vectalon/rn-vectalon) installed and on your `PATH`
- Node.js 20+
- A React Native project scanned with `vectalon init`

## Getting started

1. Run `vectalon init` in your project (creates `.vectalon/`).
2. Open the project in VS Code and activate the extension.
3. The extension auto-starts `vectalon serve --protocol http` on port 8765 if it isn't already running (toggle with the `vectalon.autoStart` setting). To use an existing server, set `vectalon.url` to its address.

## Features

**Command palette** (`Cmd/Ctrl+Shift+P` → "Vectalon"):

| Command | Description |
| --- | --- |
| `vectalon.run` | Run a feature workflow from a prompt |
| `vectalon.review` | Guardrail + code review the current file |
| `vectalon.check` | Run guardrails on the current file only |
| `vectalon.generate` | Generate a component from a description |
| `vectalon.project` | Show the project context snapshot |
| `vectalon.search` | Search the knowledge base |
| `vectalon.knowledge` | Open the Knowledge Base sidebar |
| `vectalon.start` / `vectalon.stop` | Start / stop the background `vectalon serve` |

**Inline guardrail status** — the current file is guardrailed on save and on active-file change (toggle with `vectalon.guardrailsOnSave`). Findings appear as Problems-panel diagnostics with the status bar showing a live `✓ / ✗` summary.

**Knowledge Base sidebar** — groups the project's artifact store by type (product, design, engineering, research, …). Selecting an artifact opens a rendered markdown preview panel.

## Settings

| Setting | Default | Description |
| --- | --- | --- |
| `vectalon.url` | `http://localhost:8765` | Address of a running `vectalon serve` instance |
| `vectalon.autoStart` | `true` | Spawn `vectalon serve` in the background when needed |
| `vectalon.guardrailsOnSave` | `true` | Run guardrails on save / active-file change |

## Development

- `npm run typecheck:ext` — typecheck the extension
- `npm run lint:ext` — lint the extension
- Unit tests for the pure modules live in `__tests__/extension/` and run with the root Jest suite.
