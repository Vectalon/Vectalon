# Vectalon

**The adaptive AI harness for developers — React Native, iOS, Android, Python, and beyond.**

Current RN release: <!-- product-fact:rn-version -->0.19.2<!-- /product-fact --> ·
benchmark scenarios: <!-- product-fact:benchmark-scenarios -->43<!-- /product-fact --> ·
deterministic agents: <!-- product-fact:deterministic-commands -->44<!-- /product-fact --> ·
MCP tools: <!-- product-fact:mcp-tools -->64<!-- /product-fact -->

[![BSL License](https://img.shields.io/badge/license-BSL--1.1-blue.svg)](LICENSE)
[![npm version](https://img.shields.io/npm/v/@vectalon-dev/rn)](https://www.npmjs.com/package/@vectalon-dev/rn)

---

## What is Vectalon?

Vectalon is an open-core developer tool for project-aware React Native assistance. Beta onboarding and policy capabilities are separated from experimental model, analysis, upgrade, and distribution previews in the released catalog. The package currently registers 44 deterministic commands; lifecycle, evidence, opt-in, and network requirements vary by capability, and results require human review.

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
- **Becomes MIT:** On <!-- product-fact:license-change-date -->2030-08-06<!-- /product-fact -->, this version will automatically convert to the MIT license

See [LICENSE](LICENSE) for full terms.

The VS Code extension under `packages/rn/extension` is a separate, thin client
licensed under MIT. The React Native CLI, its bundled core runtime, and the
remainder of this repository stay under BSL-1.1.

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

`@vectalon-dev/rn` is the only independently published npm package. Its build
bundles the private `@vectalon-dev/core` runtime into the package, so core is
not published separately. Add `[publish-rn]` to the release commit message to
start the guarded npm + VS Code Marketplace release.

```bash
# 1. Bump the RN package version and add its CHANGELOG entry
cd packages/rn && npm version patch --no-git-tag-version

# 2. Commit with the publish tag
git add package.json CHANGELOG.md ../../pnpm-lock.yaml
git commit -m "chore(release): publish rn [publish-rn]" && git push

# 3. The release workflow runs the benchmark, build, test, lint, and typecheck gates
# 4. It publishes @vectalon-dev/rn and the matching-version VS Code extension
# 5. It creates a Git tag and GitHub Release: rn-vX.X.X-core-vX.X.X
```

The committed VS Code extension manifest remains at its `0.1.0` baseline by
design. During a release, `scripts/publish-vsce.js` rewrites the packaged
extension to the RN package version without dirtying the checkout.

### Manual Publish (Fallback)

If you forget the commit tag, use the GitHub UI:

1. Go to **Actions → Publish Packages → Run workflow**
2. Select `@vectalon-dev/rn`
3. Click **Run workflow**

For an emergency local npm publish (CI is preferred):

```bash
pnpm publish:rn
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
- Available and beta capabilities shown by `npx vectalon capabilities`
- Experimental capabilities require `--experimental` and are not part of a paid promise

### Individual — <!-- product-fact:individual-price -->$19<!-- /product-fact -->/developer/month
- Commercial-use license for Vectalon React Native for one developer
- Qualified capabilities for this plan, as listed by the released capability catalog
- Beta access is labelled separately and is not a guaranteed purchased outcome

### Team — <!-- product-fact:team-price -->$49<!-- /product-fact -->/developer/month
- Commercial-use license for Vectalon React Native for the purchased developer quantity
- Qualified Team capabilities, as listed by the released capability catalog
- No tier-wide 50-seat cap; each developer requires a purchased seat

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
