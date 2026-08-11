# Vectalon

**The adaptive AI harness for developers — React Native, iOS, Android, Python, and beyond.**

[![BSL License](https://img.shields.io/badge/license-BSL--1.1-blue.svg)](LICENSE)
[![npm version](https://img.shields.io/npm/v/@vectalon-dev/rn)](https://www.npmjs.com/package/@vectalon-dev/rn)

---

## What is Vectalon?

Vectalon is an open-core developer tool that embeds AI intelligence directly into your codebase. It scans your project, understands its architecture, and provides project-aware assistance across the full SDLC.

> **📌 This is a public repository.** The source code is available under the Business Source License 1.1 (BSL-1.1). Commercial use by teams with >3 developers requires a paid license. The admin dashboard and internal operations tools are maintained in a separate private repository.

### Products

| Product | Package | Status |
|---|---|---|
| **React Native** | `@vectalon-dev/rn` | Available |
| **iOS (Swift)** | `@vectalon-dev/ios` | Coming soon |
| **Android (Kotlin)** | `@vectalon-dev/android` | Coming soon |
| **Python** | `@vectalon-dev/python` | Coming soon |

---

## License

Vectalon is licensed under the **Business Source License 1.1 (BSL-1.1)**.

- **Free for:** Personal use, education, open source, and commercial teams with ≤3 developers
- **Paid for:** Commercial teams with >3 developers (starting at $19/mo)
- **Becomes MIT:** On August 6, 2030, this version will automatically convert to MIT license

See [LICENSE](LICENSE) for full terms.

---

## Monorepo Structure

```
vectalon/
├── apps/
│   └── website/          # vectalon.in landing page
├── packages/
│   ├── core/             # @vectalon-dev/core — auth, licensing, telemetry, platform interfaces
│   ├── rn/               # @vectalon-dev/rn — React Native tools
│   ├── ios/              # @vectalon-dev/ios — iOS / Swift (coming soon)
│   ├── android/          # @vectalon-dev/android — Android / Kotlin (coming soon)
│   └── python/           # @vectalon-dev/python — Python / AI (coming soon)
└── ...
```

---

## CI/CD & Publishing (GitHub Actions)

### Required Secrets

Go to **Settings → Secrets and variables → Actions** and add:

| Secret | How to get it |
|---|---|
| `NPM_TOKEN` | [npmjs.com](https://www.npmjs.com) → Access Tokens → Generate new **Automation** token |
| `CODECOV_TOKEN` | [codecov.io](https://codecov.io) → Your repo → Settings → Token |

### Workflows

| Workflow | Trigger | What it does |
|---|---|---|
| **CI** | Push to `main` | Full build + test + lint + typecheck + extension checks + benchmark |
| **PR** | Pull request | Fast validation: typecheck → lint → build → test |
| **Publish** | Push to `main` with `[publish-*]` tag **or** manual (`workflow_dispatch`) | Build → test → lint → publish to npm → create Git tag |

### How to Publish a New Version (Auto-Publish on Push)

**⚠️ IMPORTANT: npm never allows republishing the same version. Always bump first.**

Add one of these tags to your commit message when pushing to `main`:

| Tag | What gets published |
|---|---|
| `[publish-core]` | `@vectalon-dev/core` only |
| `[publish-rn]` | `@vectalon-dev/rn` only |
| `[publish-both]` | Both packages |

```bash
# 1. Bump versions (pick one or both)
cd packages/core && npm version prerelease --preid=beta   # 1.0.0-beta.2 → 1.0.0-beta.3
cd packages/rn && npm version prerelease --preid=beta     # 0.6.0-beta.3 → 0.6.0-beta.4

# 2. Commit with the publish tag
git add -A && git commit -m "chore: bump versions [publish-rn]" && git push

# 3. CI runs tests automatically
# 4. Publish workflow auto-triggers and publishes the tagged package(s)
# 5. A Git tag is created: rn-vX.X.X-core-vX.X.X
```

### Manual Publish (Fallback)

If you forget the commit tag, use the GitHub UI:

1. Go to **Actions → Publish Packages → Run workflow**
2. Select the package from the dropdown
3. Click **Run workflow**

Or publish locally:

```bash
cd packages/core && npm publish --access public
cd packages/rn && npm publish --access public
```

---

## Getting Started

### React Native

```bash
npx vectalon init    # Scan project, build context
npx vectalon serve   # Start MCP server for agents
```

### Free Tier Features
- Project scanning and context building
- Basic MCP tools (40+ tools)
- Component generation
- Test writing
- Ecosystem doctor
- Benchmark suite

### Pro Tier Features ($19/mo)
- **Upgrade Copilot** — Automated React Native/Expo upgrades with codemods
- **Self-healing CI** — Auto-generate and fix CI workflows
- **Bundle Budgets** — Performance guardrails in code review
- **Advanced Guardrails** — New Architecture, React Compiler checks

### Team Tier Features ($99/seat/mo)
- **Team Brain** — Cross-project knowledge sharing
- **Cloud Sync** — Hosted knowledge base
- **Custom Models** — Azure, Ollama, vLLM support
- **Priority Inference** — Fast LLM responses

---

## Contributing

By contributing to Vectalon, you agree that your contributions will be licensed under BSL-1.1.

See [CONTRIBUTING.md](packages/rn/CONTRIBUTING.md) for guidelines.

---

## More Information

- [Website](https://vectalon.in)
- [Documentation](https://vectalon.in/docs)
- [Pricing](https://vectalon.in/pricing)
- [Changelog](packages/rn/CHANGELOG.md)

---

© 2026 Vectalon. All rights reserved.
