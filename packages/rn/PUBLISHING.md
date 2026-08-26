# Publishing

Current release inputs: RN <!-- product-fact:rn-version -->0.16.0<!-- /product-fact --> ·
core <!-- product-fact:core-version -->0.4.0<!-- /product-fact -->

`@vectalon-dev/rn` is the only independently published npm package. Its build
bundles the private core runtime, including the exact core Git revision, into
the RN tarball.

## Release workflow

The guarded [Publish Packages workflow](../../.github/workflows/publish.yml)
runs only for a manual RN dispatch or a push whose commit message contains
`[publish-rn]`. Every release:

1. Requires `CORE_REPO_PAT` and checks out the latest `Vectalon/core` `main`.
2. Records the fetched core SHA in `packages/core/core-source-revision.txt`.
3. Installs with the frozen pnpm lockfile.
4. Runs the deterministic benchmark regression gate.
5. Builds, tests, lints, and typechecks the RN package.
6. Publishes `@vectalon-dev/rn` to npm.
7. Attempts the matching VS Code Marketplace release without allowing a
   Marketplace outage to invalidate an npm publication.
8. Creates the annotated Git tag and GitHub release notes.

## Preparing a release

npm does not allow republishing an existing version. Before triggering the
workflow:

```bash
cd packages/rn
npm version patch --no-git-tag-version
# Add the matching CHANGELOG.md entry and update the root product manifest.
cd ../..
pnpm product:check
git add packages/rn/package.json packages/rn/CHANGELOG.md pnpm-lock.yaml product-manifest.json
git commit -m "chore(release): publish rn [publish-rn]"
git push origin main
```

Use `minor` or `major` instead of `patch` when the release contract requires
it. The release commit is explicit; ordinary conventional commits never
publish automatically.

## Required secrets

- `CORE_REPO_PAT` — read access to the private core repository.
- `NPM_TOKEN` — npm automation token for `@vectalon-dev/rn`.
- `VSCE_PAT` — optional until Marketplace publication is unparked.

## Emergency fallback

CI is the preferred release path. For a recovery publish after all gates have
been reproduced locally:

```bash
pnpm product:check
pnpm --filter @vectalon-dev/rn run build
pnpm --filter @vectalon-dev/rn run test
pnpm --filter @vectalon-dev/rn run lint
pnpm --filter @vectalon-dev/rn run typecheck
pnpm publish:rn
```
