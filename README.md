# Vectalon

**Your model. Your app. Stack expertise built into the workflow.**

Vectalon's goal is to make your chosen supported model measurably more effective
at developing your app, starting with React Native/Expo. Project context, guidance,
guardrails and verification are not universal model training or guaranteed expertise.
Task improvement is still being qualified; future SDKs must independently meet the
same [product principle and release gates](docs/release-roadmap/README.md#product-principle--every-sdk-agreed-2026-10-20).

Current RN release: <!-- product-fact:rn-version -->0.22.5<!-- /product-fact --> ·
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
npx --package @vectalon-dev/rn vectalon init    # Scan project, build context
npx --package @vectalon-dev/rn vectalon serve   # Start MCP server for agents
```

### Verify the complete React Native command surface locally

From this repository, build the package and run every command against ten
different React Native/Expo fixture configurations, including real local-model
inference and guardrail/adherence scoring:

```bash
pnpm --filter @vectalon-dev/rn build
node packages/rn/bin/rn-vectalon.js --experimental smoke . --matrix --full --model local --timeout 180000 --open
```

Reports are written to `.vectalon/demo-matrix/report.{json,log,html}` and the
model benchmark to `.vectalon/demo-matrix/model-local-benchmark.json`. See the
[RN post-release verification guide](packages/rn/README.md#post-release-verification-vectalon-smoke)
for model setup, focused reruns, and result interpretation.

### Free — $0
- Commercial use for individuals and teams of up to 3 developers under the BSL grant
- Project setup, inspection, diagnostics, basic policy checks, and guardrails
- Local benchmarks, smoke tests, evaluation reports, and support reports
- Experimental capabilities require `--experimental` and are not part of a paid promise

### Individual — <!-- product-fact:individual-price -->$19<!-- /product-fact -->/developer/month
- Commercial-use license for Vectalon React Native for one developer
- Everything in Free
- Experimental upgrade, CI, bundle, profile, sandbox, render, and visual-regression workflows require explicit opt-in
- Qualified feature-workflow beta access; model workflows remain experimental and require review

### Team — <!-- product-fact:team-price -->$49<!-- /product-fact -->/developer/month
- Commercial-use license for Vectalon React Native for the purchased developer quantity
- Everything in Individual
- Experimental Team Brain, local shared knowledge, Git-backed sync, and shared team policies
- Experimental capabilities require explicit opt-in and are not qualified paid outcomes
- No tier-wide 50-seat cap; each developer requires a purchased seat

Plans are cumulative and currently cover the React Native harness only. A paid
license never bypasses explicit experimental opt-in, availability checks, or
human review of generated changes. Planned SDKs are not silently included.

See your current plan and what each tier unlocks with `npx --package @vectalon-dev/rn vectalon plan`, and
the engineering outcomes your reports produce with `npx --package @vectalon-dev/rn vectalon outcomes`.

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
