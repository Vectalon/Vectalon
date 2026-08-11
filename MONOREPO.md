/**
 * Vectalon Monorepo
 * 
 * Business Source License 1.1 (BSL-1.1)
 * © 2026 Vectalon. Commercial use requires a paid license.
 * See LICENSE for details.
 * 
 * This is the root of the Vectalon monorepo, managed by Turborepo + pnpm.
 */

## Structure

```
vectalon/
├── apps/
│   └── website/          # vectalon.in landing page (Next.js)
├── packages/
│   ├── core/             # @vectalon-dev/core — auth, licensing, telemetry, platform interfaces
│   ├── rn/               # @vectalon-dev/rn — React Native tools
│   ├── ios/              # @vectalon-dev/ios — iOS / Swift (coming soon)
│   ├── android/          # @vectalon-dev/android — Android / Kotlin (coming soon)
│   ├── python/           # @vectalon-dev/python — Python / AI (coming soon)
│   └── ts-config/        # Shared TypeScript configuration
├── .github/workflows/    # CI/CD pipelines
├── turbo.json            # Turborepo configuration
├── pnpm-workspace.yaml   # pnpm workspaces
└── package.json          # Root package
```

## Quick Start

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run tests
pnpm test

# Lint
pnpm lint

# Type check
pnpm typecheck
```

## Development

```bash
# Dev mode (watch)
pnpm dev

# Publish packages
pnpm publish:core    # Publish @vectalon-dev/core
pnpm publish:rn      # Publish @vectalon-dev/rn
```

## License

Business Source License 1.1 (BSL-1.1) — see [LICENSE](LICENSE) for details.

© 2026 Vectalon
