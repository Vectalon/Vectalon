# Vectalon Archive & Share — Architecture Design Document

**Status:** Draft v1.0  
**Date:** 2026-08-15  
**Scope:** End-to-end build artifact archive, distribution, and sharing for React Native, iOS, and Android projects.

---

## 1. Executive Summary

Vectalon Archive & Share is a three-pronged build artifact system that enables developers to:

1. **Archive** — Build, version, and store IPA/APK/AAB artifacts locally with full provenance (git, flavor, environment, metadata).
2. **Distribute** — Seamlessly deploy builds to TestFlight, Play Store, or internal tracks.
3. **Share** — Ephemeral local sharing via CLI (`vectalon share --host`) and persistent team sharing via SaaS (`builds.vectalon.in`) with custom-domain white-label portals.

The feature integrates into Vectalon's existing CLI, MCP server, VS Code extension, tier model, and CI/CD workflow generation.

---

## 2. Goals & Non-Goals

### Goals
- Zero-config flavor detection from `build.gradle` and Xcode schemes.
- Deterministic local archive with SHA-256 checksums and BuildManifest.
- Tiered access: Free (local), Individual (store distribution), Team (SaaS + custom domain).
- Credential delegation — Vectalon never stores App Store Connect or Google Play keys.
- Ephemeral local sharing with QR codes and install pages.
- White-label Next.js portal generator for custom-domain build sharing.
- CI/CD native — archive and distribute in GitHub Actions / EAS Workflows.

### Non-Goals
- Build the artifacts ourselves (we wrap `xcodebuild`, `gradle`, `eas build`, `fastlane`).
- Host a full CI/CD runner (we generate workflows, not replace them).
- Store credentials (we delegate to Fastlane match, EAS credentials, Expo credentials).

---

## 3. Core Concepts

### 3.1 BuildManifest
Every archived build carries a typed manifest:

```typescript
interface BuildManifest {
  buildId: string;              // uuid v4
  projectId: string;              // from .vectalon/rn-vectalon.json
  version: string;              // semver from package.json
  buildNumber: number;            // auto-increment per flavor/platform
  flavor: string;               // e.g., "staging", "production"
  environment: string;          // e.g., "debug", "release"
  platform: 'ios' | 'android';
  artifactType: 'ipa' | 'apk' | 'aab';
  artifactPath: string;         // local path relative to project root
  artifactSize: number;         // bytes
  checksum: string;             // sha256
  gitCommit: string;            // HEAD sha
  gitBranch: string;
  gitTag?: string;
  buildTimestamp: string;       // ISO 8601
  builtBy: string;              // git user.email or CI actor
  buildDurationMs?: number;     // how long the build took
  metadata: BuildMetadata;
  signatures?: BuildSignatures;
  distribution?: DistributionRecord;
}

interface BuildMetadata {
  xcodeVersion?: string;
  androidSdkVersion?: string;
  reactNativeVersion: string;
  expoSdkVersion?: string;
  metroVersion?: string;
  gradleVersion?: string;
  nodeVersion: string;
  nativeConfig: Record<string, unknown>;
}

interface BuildSignatures {
  enterprise?: string;
  adHoc?: string;
  appStore?: string;
  playStore?: string;
}

interface DistributionRecord {
  testflight?: {
    buildId: string;
    status: 'uploaded' | 'processing' | 'ready' | 'failed';
    uploadDate: string;
    appleId?: string;
  };
  playStore?: {
    track: 'internal' | 'alpha' | 'beta' | 'production';
    versionCode: number;
    status: 'uploaded' | 'processing' | 'ready' | 'failed';
    uploadDate: string;
  };
  saas?: {
    url: string;
    expiresAt?: string;
    access: 'public' | 'team' | 'private';
  };
  portal?: {
    domain: string;
    url: string;
    deployedAt: string;
  };
}
```

### 3.2 Flavor
A flavor is a named build configuration that maps to platform-specific build variants:

```typescript
interface FlavorConfig {
  name: string;                 // "staging", "production", "debug"
  android?: string;             // productFlavor name in build.gradle
  ios?: string;                 // Xcode scheme name
  envFile?: string;             // ".env.staging", ".env.production"
  envVars?: Record<string, string>;
  isDefault?: boolean;          // used when no flavor is specified
}
```

**Auto-detection**: `FlavorDetector` scans `android/app/build.gradle` for `productFlavors` and `ios/*.xcscheme` for scheme names. Results are cached in `.vectalon/builds/flavors.json`, which users can edit to add env files, overrides, or custom flavors.

### 3.3 Archive
A local store of build artifacts organized as:

```
.vectalon/
├── builds/
│   └── <projectId>/
│       └── <flavor>/
│           └── <environment>/
│               └── <version>/
│                   └── <buildNumber>/
│                       ├── ios/
│                       │   ├── app.ipa
│                       │   ├── app.ipa.sha256
│                       │   └── manifest.json
│                       └── android/
│                           ├── app.apk
│                           ├── app.aab
│                           ├── *.sha256
│                           └── manifest.json
├── builds.json                 // archive index (SQLite-backed via ArchiveStore)
└── flavors.json                // detected + user-managed flavor configs
```

### 3.4 Distribution Targets
| Target | Mechanism | Tier |
|---|---|---|
| **TestFlight** | App Store Connect API (via `fastlane pilot` or direct API) | Pro |
| **Play Store — Internal** | Google Play Android Publisher API (via `fastlane supply` or direct API) | Pro |
| **Play Store — Alpha/Beta/Prod** | Same as above | Pro |
| **SaaS Portal** | `POST builds.vectalon.in/v1/builds` with API key | Team |
| **Custom Domain Portal** | Generated Next.js site + Vercel/Netlify deploy | Team |
| **Local Share** | Static server + tunnel (ngrok/localtunnel) | Free |

---

## 4. User Experience

### 4.1 CLI Commands

#### `vectalon archive [directory]`
Build and archive artifacts for the current project.

```bash
npx vectalon archive                          # archive default flavor, current platform
npx vectalon archive --flavor staging         # archive staging flavor
npx vectalon archive --flavor production --platform ios   # explicit platform
npx vectalon archive --env-file .env.staging  # load env before build
npx vectalon archive --build-number 42        # override auto-increment
npx vectalon archive --no-build               # archive existing artifact (skip build)
npx vectalon archive --artifact ./app.ipa     # archive a pre-built artifact
npx vectalon archive --list                   # list archived builds
npx vectalon archive --list --flavor staging --platform android
npx vectalon archive --push                   # push to SaaS after archiving (Team)
npx vectalon archive --json                   # machine-readable output
```

**What it does:**
1. Detects project type (Expo / bare RN CLI / pure native).
2. Auto-detects flavors or loads `flavors.json`.
3. Runs the appropriate build command:
   - Expo: `eas build --platform <ios|android> --profile <flavor>`
   - Bare RN CLI: `cd android && ./gradlew assemble<Flavor><Env>` or `cd ios && xcodebuild -scheme <Flavor> -configuration <Env>`
   - Or uses pre-built artifact with `--artifact`.
4. Computes SHA-256, builds `BuildManifest`, stores in `.vectalon/builds/`.
5. Updates the archive index in `ArchiveStore`.
6. Writes report to `docs/vectalon/archive/report.{json,md}`.

#### `vectalon distribute [directory]`
Deploy an archived build to a store or sharing platform.

```bash
npx vectalon distribute --build <buildId> --target testflight
npx vectalon distribute --build <buildId> --target play-store --track internal
npx vectalon distribute --build <buildId> --target saas                  # Team
npx vectalon distribute --build <buildId> --target portal --domain builds.mycompany.com  # Team
npx vectalon distribute --latest --flavor production --target testflight  # shorthand
npx vectalon distribute --list-targets                                   # show available targets
npx vectalon distribute --json
```

**What it does:**
1. Resolves the build from `ArchiveStore` by `buildId` or `--latest`.
2. Detects available credential providers (Fastlane, EAS, Expo).
3. Delegates to the appropriate store API:
   - TestFlight: `fastlane pilot upload` or App Store Connect API.
   - Play Store: `fastlane supply` or Google Play API.
   - SaaS: `POST` to `builds.vectalon.in/v1/builds` with `VECTALON_BUILDS_API_KEY`.
   - Portal: generates/deploys white-label site.
4. Updates the `DistributionRecord` in the build manifest.
5. Writes report to `docs/vectalon/distribute/report.{json,md}`.

#### `vectalon share --host [directory]`
Spin up an ephemeral local server to share builds via URL.

```bash
npx vectalon share --host                     # serve latest build on localhost
npx vectalon share --host --build <buildId>   # serve specific build
npx vectalon share --host --flavor staging     # serve latest staging build
npx vectalon share --host --tunnel            # expose via ngrok / localtunnel
npx vectalon share --host --tunnel --qr       # print QR code to terminal
npx vectalon share --host --port 3000         # custom port
npx vectalon share --host --expires 30m       # auto-shutdown after 30 min
```

**What it does:**
1. Resolves the build to serve.
2. Generates a self-contained HTML install page (QR code, platform badges, install instructions, metadata).
3. Spins up a lightweight static server (Express/polka) serving `.vectalon/builds/` + the generated page.
4. Optional: opens a tunnel via ngrok/localtunnel, prints public URL + QR code.
5. Auto-shutdown on Ctrl-C or after `--expires`.
6. Writes access log to `.vectalon/share/access.log`.

#### `vectalon portal [directory]`
Generate a white-label Next.js portal for build sharing.

```bash
npx vectalon portal --generate                # generate portal site in .vectalon/portal/
npx vectalon portal --generate --out ./portal-site
npx vectalon portal --deploy --target vercel  # deploy to Vercel (requires vercel CLI)
npx vectalon portal --deploy --target netlify # deploy to Netlify
npx vectalon portal --deploy --target static  # export static HTML to ./out/
npx vectalon portal --sync                    # pull builds from SaaS into local portal
npx vectalon portal --domain builds.mycompany.com
npx vectalon portal --branding '{"logo":"./logo.png","primaryColor":"#FF5733"}'
```

**What it does:**
1. Generates a Next.js static site:
   - Build listing page (filter by flavor, platform, version, date).
   - Per-build detail page (metadata, QR code, direct download, install instructions).
   - Team access gate (password or email-domain whitelist, Team tier).
2. Embeds build data from `ArchiveStore` or pulls from SaaS API.
3. Supports custom domain, logo, colors via `--branding`.
4. Deploys via `--deploy` to Vercel/Netlify/static export.
5. Writes report to `docs/vectalon/portal/report.{json,md}`.

---

### 4.2 Interactive Menu
The `npx vectalon` interactive menu gains new entries:
- Archive build
- List archived builds
- Distribute to TestFlight
- Distribute to Play Store
- Share build locally
- Generate portal site
- Deploy portal

---

## 5. System Architecture

### 5.1 Module Structure

```
packages/rn/src/
├── archive/
│   ├── ArchiveStore.ts          # SQLite-backed build index (extends ArtifactStore)
│   ├── BuildManifest.ts         # Zod schema + validation + serialization
│   ├── FlavorDetector.ts        # Auto-detect from gradle/xcode + manual overrides
│   ├── BuildExecutor.ts         # Wraps platform build commands
│   ├── ArchiveCommand.ts        # CLI handler logic
│   └── types.ts                 # Shared types
├── distribute/
│   ├── DistributeCommand.ts     # CLI handler logic
│   ├── StoreConnect.ts          # App Store Connect API client
│   ├── PlayPublisher.ts         # Google Play Android Publisher API client
│   ├── SaasClient.ts            # builds.vectalon.in API client
│   ├── CredentialDelegator.ts   # Detects and delegates to Fastlane/EAS/Expo
│   ├── PortalDeployer.ts        # Vercel/Netlify/static deploy
│   └── types.ts
├── share/
│   ├── ShareCommand.ts          # CLI handler logic
│   ├── LocalServer.ts           # Static file server
│   ├── TunnelAdapter.ts         # ngrok / localtunnel wrapper
│   ├── PortalPage.ts            # HTML install page generator
│   └── types.ts
├── portal/
│   ├── PortalGenerator.ts       # Next.js site generator
│   ├── PortalTemplates/         # React page components
│   │   ├── Layout.tsx
│   │   ├── BuildListPage.tsx
│   │   ├── BuildDetailPage.tsx
│   │   └── InstallPage.tsx
│   └── types.ts
└── cli/commands/
    ├── archive.ts
    ├── distribute.ts
    ├── share.ts
    └── portal.ts
```

### 5.2 ArchiveStore
Extends the existing `ArtifactStore` pattern (SQLite + `cosineSimilarity` vector search when applicable). Schema:

```sql
CREATE TABLE builds (
  build_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  version TEXT NOT NULL,
  build_number INTEGER NOT NULL,
  flavor TEXT NOT NULL,
  environment TEXT NOT NULL,
  platform TEXT NOT NULL,
  artifact_type TEXT NOT NULL,
  artifact_path TEXT NOT NULL,
  artifact_size INTEGER NOT NULL,
  checksum TEXT NOT NULL,
  git_commit TEXT,
  git_branch TEXT,
  git_tag TEXT,
  build_timestamp TEXT NOT NULL,
  built_by TEXT,
  build_duration_ms INTEGER,
  metadata_json TEXT,
  signatures_json TEXT,
  distribution_json TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_builds_project ON builds(project_id);
CREATE INDEX idx_builds_flavor ON builds(flavor);
CREATE INDEX idx_builds_platform ON builds(platform);
CREATE INDEX idx_builds_version ON builds(version);
CREATE INDEX idx_builds_timestamp ON builds(build_timestamp);
```

### 5.3 FlavorDetector
**Auto-detect**:
- Android: Parse `android/app/build.gradle` for `productFlavors { ... }` blocks.
- iOS: Parse `ios/*.xcscheme` XML for `BlueprintIdentifier` → scheme names.
- Expo: Read `eas.json` for build profiles.

**User override**:
Write `.vectalon/builds/flavors.json`:

```json
{
  "$schema": "https://vectalon.in/schemas/flavors.json",
  "flavors": [
    { "name": "development", "android": "dev", "ios": "Dev", "envFile": ".env.dev", "isDefault": true },
    { "name": "staging", "android": "staging", "ios": "Staging", "envFile": ".env.staging" },
    { "name": "production", "android": "production", "ios": "Release", "envFile": ".env.production" }
  ]
}
```

### 5.4 BuildExecutor
Platform-specific build wrappers:

| Platform | Tool | Command |
|---|---|---|
| Expo iOS | EAS CLI | `eas build --platform ios --profile <flavor> --local` or `--non-interactive` |
| Expo Android | EAS CLI | `eas build --platform android --profile <flavor> --local` |
| Bare iOS | xcodebuild | `cd ios && xcodebuild -workspace <name>.xcworkspace -scheme <flavor> -configuration <env> -archivePath ... exportArchive ...` |
| Bare Android | Gradle | `cd android && ./gradlew assemble<Flavor><Env> bundle<Flavor><Env>` |

### 5.5 CredentialDelegator
Never stores credentials. Detects and delegates:

| Provider | Detection | Delegation |
|---|---|---|
| **Fastlane** | `Gemfile` has `fastlane`, `fastlane/` directory exists | `fastlane pilot upload`, `fastlane supply` |
| **EAS** | `eas.json` exists, `eas-cli` on PATH | `eas submit --platform <p>` |
| **Expo** | `expo` in dependencies | `expo upload:submission` |

For direct API usage (fallback when no tool is detected):
- TestFlight: App Store Connect API (JWT auth from `APP_STORE_CONNECT_API_KEY` env var).
- Play Store: Google Play API (service account JSON from `GOOGLE_PLAY_SERVICE_ACCOUNT` env var).

**Error handling**: If no credential provider is detected, print actionable instructions:
```
No credential provider detected. To distribute to TestFlight, either:
1. Install Fastlane and run `fastlane init` in your ios/ directory.
2. Set APP_STORE_CONNECT_API_KEY environment variable for direct API access.
```

### 5.6 SaasClient
REST API client for `builds.vectalon.in`:

```typescript
interface SaasConfig {
  apiKey: string;               // VECTALON_BUILDS_API_KEY
  endpoint: string;             // https://builds.vectalon.in/v1
  projectId: string;
}

// Upload build (signed URL pattern)
POST /v1/builds/initiate → { uploadUrl, buildId: saasBuildId }
PUT uploadUrl → upload artifact
POST /v1/builds/confirm → { url, expiresAt }

// List builds
GET /v1/builds?projectId=<id>&flavor=<f>&platform=<p>

// Custom domain
POST /v1/projects/<id>/domain → { domain: "builds.mycompany.com" }
GET /v1/projects/<id>/domain/status → { status: "pending" | "active", cname: "..." }
```

### 5.7 PortalGenerator
Generates a Next.js 14+ app using App Router:

```
.vectalon/portal/
├── app/
│   ├── layout.tsx              # Root layout with branding
│   ├── page.tsx                # Build listing
│   ├── build/[id]/page.tsx     # Build detail
│   └── api/builds/route.ts     # Static data endpoint (or SSG)
├── components/
│   ├── BuildCard.tsx
│   ├── QRCode.tsx
│   ├── PlatformBadge.tsx
│   └── InstallInstructions.tsx
├── public/
│   └── builds.json             # Embedded build data (SSG) or fetched at runtime
├── next.config.js              # output: 'export' for static, or serverless
└── package.json
```

**SSG mode** (`--deploy --target static`): Embeds `builds.json` at build time. No backend needed.  
**SSR mode** (`--deploy --target vercel`): Fetches from SaaS API at request time. Dynamic filtering.

### 5.8 LocalServer + TunnelAdapter
**LocalServer**: Express/polka static server:
- Serves `.vectalon/builds/<buildId>/` directory.
- Serves generated `index.html` (install page) at root.
- CORS enabled for QR code scanners.

**TunnelAdapter**:
- Detects `ngrok` on PATH → `ngrok http <port>`.
- Fallback: `localtunnel` npm package (`lt --port <port>`).
- Prints public URL + QR code to terminal (via `qrcode-terminal` or similar).

---

## 6. Tier Gating

| Feature | Free | Individual ($19/dev/mo) | Team ($49/dev/mo) |
|---|---|---|---|
| `vectalon archive` (local) | ✅ | ✅ | ✅ |
| `vectalon archive --list` | ✅ | ✅ | ✅ |
| `vectalon share --host` | ✅ | ✅ | ✅ |
| `vectalon distribute --target testflight` | ❌ | ✅ | ✅ |
| `vectalon distribute --target play-store` | ❌ | ✅ | ✅ |
| `vectalon archive --push` (SaaS) | ❌ | ❌ | ✅ |
| `vectalon distribute --target saas` | ❌ | ❌ | ✅ |
| `vectalon distribute --target portal` | ❌ | ❌ | ✅ |
| `vectalon portal --generate` | ❌ | ❌ | ✅ |
| `vectalon portal --deploy` | ❌ | ❌ | ✅ |
| Custom domain white-label | ❌ | ❌ | ✅ |
| Team access control (portal) | ❌ | ❌ | ✅ |
| Build analytics (SaaS dashboard) | ❌ | ❌ | ✅ |

---

## 7. CI/CD Integration

### 7.1 Generated Workflow Snippets
The existing `vectalon ci` and `vectalon release` commands are extended to include archive/distribute steps.

**Expo EAS Workflow** (`.eas/workflows/vectalon.yml`):

```yaml
build:
  type: build
  params:
    platform: ios
    profile: production

archive:
  type: custom
  script: |
    npx vectalon archive --flavor production --platform ios --push

distribute:
  type: custom
  needs: [archive]
  if: ${{ github.ref_name == 'main' }}
  script: |
    npx vectalon distribute --latest --flavor production --target testflight
```

**GitHub Actions** (`.github/workflows/vectalon-release.yml`):

```yaml
- name: Archive Build
  run: npx vectalon archive --flavor production --platform ios

- name: Distribute to TestFlight
  if: github.ref == 'refs/heads/main'
  run: npx vectalon distribute --latest --flavor production --target testflight
  env:
    APP_STORE_CONNECT_API_KEY: ${{ secrets.APP_STORE_CONNECT_API_KEY }}
```

### 7.2 Environment Variables
| Variable | Purpose | Tier |
|---|---|---|
| `VECTALON_BUILDS_API_KEY` | SaaS API authentication | Team |
| `APP_STORE_CONNECT_API_KEY` | App Store Connect JWT | Pro |
| `GOOGLE_PLAY_SERVICE_ACCOUNT` | Google Play service account JSON path | Pro |
| `FASTLANE_PASSWORD` | Fastlane Apple ID password (if using Fastlane) | Pro |

---

## 8. MCP Tools

New tools registered in `vectalon serve`:

| Tool | Input | Output | Tier |
|---|---|---|---|
| `archive_build` | `{ flavor?, platform?, envFile?, noBuild?, artifact? }` | `{ buildId, manifest, reportPath }` | Free |
| `list_builds` | `{ flavor?, platform?, limit? }` | `{ builds: BuildManifest[] }` | Free |
| `distribute_build` | `{ buildId, target, track?, domain? }` | `{ distributionRecord, reportPath }` | Pro/Team |
| `share_build_locally` | `{ buildId?, port?, tunnel?, expires? }` | `{ url, qrCode, expiresAt }` | Free |
| `generate_portal` | `{ out?, domain?, branding?, target? }` | `{ portalPath, deployInstructions }` | Team |
| `detect_flavors` | `{}` | `{ flavors: FlavorConfig[], source: 'auto-detected' | 'user-config' }` | Free |

---

## 9. VS Code Extension

New command palette entries:

| Command | Action |
|---|---|
| Vectalon: Archive Build | Run `archive` with flavor picker |
| Vectalon: List Builds | Show build explorer in sidebar |
| Vectalon: Distribute to TestFlight | Distribute latest iOS build |
| Vectalon: Distribute to Play Store | Distribute latest Android build |
| Vectalon: Share Build Locally | Start local server, copy URL |
| Vectalon: Generate Portal | Generate white-label portal |

**Sidebar Tree View**: "Builds" panel showing:
- Flavors → Environments → Versions → Builds
- Right-click: Distribute, Share, Copy Download Link, View Manifest

---

## 10. Data Flow

```
[User runs: vectalon archive --flavor staging]
           │
           ▼
    [FlavorDetector] ──► detects "staging" from gradle/xcode
           │
           ▼
    [BuildExecutor] ──► runs gradle assembleStagingRelease
           │
           ▼
    [ArchiveStore] ──► writes artifact + manifest to .vectalon/builds/
           │
           ▼
    [ReportWriter] ──► docs/vectalon/archive/report.md
           │
           ▼
    (optional --push) [SaasClient] ──► POST to builds.vectalon.in
           │
           ▼
    (optional) [DistributeCommand] ──► StoreConnect / PlayPublisher / PortalDeployer
```

---

## 11. Error Handling & Edge Cases

| Scenario | Behavior |
|---|---|
| No `.vectalon/` directory | Exit 1: "Run `vectalon init` first." |
| No flavor detected and no `flavors.json` | Exit 1: "No flavors detected. Run `vectalon archive --init` to create `flavors.json`." |
| Build fails (gradle/xcode error) | Capture stderr, classify via existing `BuildFix` agent, report to `docs/vectalon/build-fix/`. |
| No credentials for distribute | Exit 1 with actionable instructions (see CredentialDelegator). |
| SaaS API key missing for `--push` | Exit 1: "Set `VECTALON_BUILDS_API_KEY` or upgrade to Team tier." |
| Tunnel service (ngrok) not installed | Degrade to localhost URL with warning. |
| Custom domain DNS not verified | SaaS returns `pending` status; portal generator includes CNAME instructions. |
| Duplicate build (same checksum) | Skip archive, log "Build already archived as <buildId>." |

---

## 12. Testing Strategy

### 12.1 Hermetic Tests
- `FlavorDetector`: Parse fixture `build.gradle` and `.xcscheme` files, assert detected flavors.
- `BuildManifest`: Zod validation with valid/invalid fixtures.
- `ArchiveStore`: In-memory SQLite, CRUD operations, indexing.
- `CredentialDelegator`: Mock filesystem detection of Fastlane/EAS/Expo.
- `PortalGenerator`: Generate to temp dir, assert file tree and `builds.json` content.
- `LocalServer`: Start server, fetch install page, assert 200.
- `TunnelAdapter`: Mock ngrok/localtunnel binary, assert URL returned.

### 12.2 Integration Tests
- `archive --no-build --artifact <fixture.ipa>`: End-to-end archive with checksum verification.
- `share --host`: Start server, fetch page, stop server.
- `distribute --dry-run`: Simulate distribution without API calls.

### 12.3 Smoke Test Coverage
Add to `vectalon smoke`:
- `archive` (dry-run with fixture artifact)
- `share --host` (start/stop)
- `portal --generate` (temp output)
- `distribute --list-targets` (dry-run)

---

## 13. Documentation

| Document | Path |
|---|---|
| This design doc | `docs/superpowers/specs/ARCHIVE_AND_SHARE_DESIGN.md` |
| CLI reference updates | `apps/website/docs/CLI_REFERENCE.md` (add `archive`, `distribute`, `share`, `portal`) |
| Onboarding updates | `apps/website/docs/ONBOARDING.md` (build & share section) |
| README updates | `packages/rn/README.md` (feature table) |

---

## 14. Implementation Phases

| Phase | Scope | Deliverables | ETA |
|---|---|---|---|
| **1. Foundation** | `BuildManifest`, `ArchiveStore`, `FlavorDetector`, `archive` CLI | `src/archive/*`, `src/cli/commands/archive.ts`, tests, docs | 1 week |
| **2. Distribution** | `DistributeCommand`, `StoreConnect`, `PlayPublisher`, `CredentialDelegator` | `src/distribute/*`, `src/cli/commands/distribute.ts`, tests | 1 week |
| **3. Local Sharing** | `LocalServer`, `TunnelAdapter`, `PortalPage`, `share --host` | `src/share/*`, `src/cli/commands/share.ts`, tests | 3 days |
| **4. Portal Generator** | `PortalGenerator`, Next.js templates, `portal` CLI | `src/portal/*`, `src/cli/commands/portal.ts`, tests | 1 week |
| **5. SaaS Integration** | `SaasClient`, API key auth, custom domain config | `src/distribute/SaasClient.ts`, backend API spec | 1 week |
| **6. MCP + VS Code** | Register tools, add extension commands | `src/protocol/tools.ts`, `extension/src/commands.ts` | 3 days |
| **7. CI/CD + Polish** | Workflow generation, tier gating, smoke tests, final docs | `src/adapters/ciTemplates.ts`, `src/adapters/releaseTemplates.ts` updates | 3 days |

**Total estimated time**: ~5 weeks (1 engineer full-time).

---

## 15. Open Questions (To Resolve During Implementation)

1. **SaaS backend implementation** — Is the `builds.vectalon.in` backend already planned, or should this design include the backend API spec for a separate team to implement?
2. **Storage backend pluggability** — Should `ArchiveStore` support S3/R2 as primary storage (not just sync target), or is local + SaaS push sufficient for v1?
3. **iOS code signing in CI** — Should `BuildExecutor` attempt to configure code signing (provisioning profiles, certificates), or explicitly require the user to set it up via Fastlane match / EAS before archiving?
4. **Android keystore management** — Same as above for `gradle` signing config.

---

**End of Document**
