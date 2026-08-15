# Vectalon for VS Code

A thin IDE layer over the [rn-vectalon](https://github.com/Vectalon/Vectalon) MCP server. No new backend — the extension talks to `vectalon serve --protocol http` over the same HTTP tool surface the CLI exposes (`GET /tools`, `POST /call`).

## Install

**Marketplace** — install `vectalon-dev.vectalon` from the Extensions view (`Cmd/Ctrl+Shift+X` → search "Vectalon"), or:

```bash
code --install-extension vectalon-dev.vectalon
```

**From a local build** — after `npm ci`, package and install a `.vsix`:

```bash
npx vsce package --out vectalon-local.vsix
code --install-extension vectalon-local.vsix
```

**Auto-update** — every `semantic-release` bumps the extension version to match the npm release and publishes a new `.vsix` to the Marketplace, so VS Code's built-in extension auto-update (on by default) keeps you current. Install from the Marketplace (not a local `.vsix`) to receive updates.

## Requirements

- [rn-vectalon](https://github.com/Vectalon/Vectalon) installed and on your `PATH`
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
| `vectalon.archive` | Build + archive the current project (flavor prompt, auto-detect) |
| `vectalon.distribute` | Plan a distribution (TestFlight / Play / SaaS / portal) |
| `vectalon.share` | Serve the latest build on a local install page |
| `vectalon.portal` | Generate a white-label static build portal |
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
- `npx vsce package` — build a `.vsix` (runs `vscode:prepublish`, so the extension is compiled first, then packages the files listed by `npx vsce ls`)
- `node scripts/publish-vsce.js <version>` — compile + package + publish to the Marketplace (uses the `VSCE_PAT` token; skips the upload with a warning when it's unset)
- **Every `[publish-rn]` release publishes the extension** — the `publish.yml` workflow runs `scripts/publish-vsce.js` with the released version right after the npm publish, so the Marketplace always matches the npm release (and VS Code auto-update picks it up). The **Publish VS Code extension (manual)** workflow (`workflow_dispatch`) is the retry / publish-any-version path.
- Marketplace metadata (`galleryBanner`, badges, icon, `extensionKind`) lives in `extension/package.json`; the Marketplace **Changelog** tab is fed by `extension/CHANGELOG.md`.

### One-time marketplace bootstrap

Before the first publish can succeed:

1. **Register the publisher** — `npx vsce create-publisher vectalon-dev` (or reuse an existing publisher you own) and accept the Marketplace agreement.
2. **Create a Marketplace PAT** — a VS Code Marketplace personal access token (from `dev.azure.com` — *not* a GitHub token), stored as the **`VSCE_PAT`** GitHub secret on the `publish.yml` workflow (and the `vsce-publish` workflow).
3. Trigger a `[publish-rn]` release — or run the **Publish VS Code extension (manual)** workflow (`workflow_dispatch`) to publish a specific version, which also serves as the retry path if an automated upload ever fails.

Note: the committed `extension/package.json` version is the baseline only — published `.vsix` files always carry the release version. To test a real upload locally: `export VSCE_PAT=… && node scripts/publish-vsce.js 0.1.0` (compiles, packages to `/tmp`, and uploads).
