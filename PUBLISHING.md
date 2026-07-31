# Publishing

`@vectalon/rn-vectalon` is published automatically with [semantic-release](https://semantic-release.gitbook.io/).

## How it works

1. Every push to `main` triggers the [Release workflow](.github/workflows/release.yml).
2. The workflow runs tests, lint, type check, and build.
3. `semantic-release` analyzes commits using the [Conventional Commits](https://www.conventionalcommits.org/) standard.
4. If a release is warranted, it:
   - Bumps `package.json` version
   - Updates `CHANGELOG.md`
   - Publishes to npm
   - Creates a GitHub release with notes

## Commit message format

| Commit | Result |
|---|---|
| `fix: ...` | Patch release (e.g. `0.1.1`) |
| `feat: ...` | Minor release (e.g. `0.2.0`) |
| `feat!: ...` or `BREAKING CHANGE:` in body | Major release |
| `chore: ...`, `docs: ...`, `ci: ...` | No release |

## First-time npm setup

1. Create the `@vectalon` organization on [npmjs.org](https://www.npmjs.com/org/create).
2. Generate an **Automation** npm access token at [npmjs.com/settings/tokens](https://www.npmjs.com/settings/tokens).
3. Add the token as a repository secret named `NPM_TOKEN` at:
   `GitHub repo → Settings → Secrets and variables → Actions → New repository secret`.
4. `GITHUB_TOKEN` is provided by GitHub Actions automatically.

## Manual publish

Only needed in emergencies. Prefer semantic-release.

```bash
npm login
npm run build
npm run test
npm publish --access public
```
