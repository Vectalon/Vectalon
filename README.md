# Vectalon

**The adaptive AI harness for developers — React Native, iOS, Android, Python, and beyond.**

[![BSL License](https://img.shields.io/badge/license-BSL--1.1-blue.svg)](LICENSE)
[![npm version](https://img.shields.io/npm/v/@vectalon-dev/rn)](https://www.npmjs.com/package/@vectalon-dev/rn)

---

## What is Vectalon?

Vectalon is an open-core developer tool that embeds AI intelligence directly into your codebase. It scans your project, understands its architecture, and provides project-aware assistance across the full SDLC — through a local MCP-native agent (feature workflows, codegen, upgrades, device control) and a fleet of 45 deterministic agent commands (review, security, SOC 2, release prediction, dashboard, fix, fix-bench, pr, …) that run offline with a report and a verdict every time.

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
- **Paid for:** Commercial teams with >3 developers (starting at $19/dev/mo)
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

### Free — $0
- Project scanning and context building
- 60+ MCP project-aware tools
- **All deterministic agent commands** — code review, architecture, security, build/test repair, refactoring, SOC 2, CI/CD, store readiness, team analytics, and enterprise intelligence (figma, sentry, governance, release-predict, dataset, lora, …), each with a report and a verdict — no model required. `fix` diagnoses and auto-fixes real RN failures; `fix-bench` proves it against 100 committed failure scenarios (100/100 diagnosis, 70/100 auto-fix, 0 false positives); `pr` reviews a pull request — five checks over the added lines, the health impact, and a one-command bot comment
- Component generation
- Test writing
- Ecosystem doctor
- Benchmark suite

### Individual — $19/developer/month
- **Local AI** — local GGUF/WASM models, your source never leaves the machine
- **Project intelligence** — intel, score, review, sec, arch
- **Diagnostics** — doctor, build-fix, profile, sandbox, render
- **Upgrade Copilot** — Automated React Native/Expo upgrades with codemods
- **Self-healing CI** — Auto-generate and fix CI workflows

### Team — $49/developer/month
- **Team Brain** — decisions, expertise, shared knowledge across projects
- **Shared policies + PR review**
- **CI + dashboards** — coverage, score trends
- **Cross-project intelligence + cloud sync**

### Enterprise — Custom (annual)
- Self-hosted deployment (air-gapped ready)
- SSO / SAML + audit trails
- Private / company-controlled models (Ollama, vLLM)
- Organization-wide policies + multi-repository intelligence

See your current plan and what each tier unlocks with `npx vectalon plan`, and
the engineering outcomes your reports produce with `npx vectalon outcomes`.

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
