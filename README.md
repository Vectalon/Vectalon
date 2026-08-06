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

© 2026 Bhishak Sanyal. All rights reserved.
