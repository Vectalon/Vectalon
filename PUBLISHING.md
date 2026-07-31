# Publishing

`@vectalon/rn-vectalon` is published to the public npm registry under the `@vectalon` scope.

## Automated publishing from GitHub

1. Create the `@vectalon` organization on [npmjs.org](https://www.npmjs.com/org/create).
2. Generate an **Automation** npm access token at [npmjs.com/settings/tokens](https://www.npmjs.com/settings/tokens).
3. Add the token as a repository secret named `NPM_TOKEN` at:
   `GitHub repo → Settings → Secrets and variables → Actions → New repository secret`.
4. Create a GitHub release with a new version tag (e.g. `v0.1.0`).
   The [publish.yml](.github/workflows/publish.yml) workflow will run tests, build, and publish.

## Manual publishing

You can also publish manually from a local machine if you are logged in to npm:

```bash
npm login
npm run build
npm run test
npm publish --access public
```

For scoped packages, `--access public` is required on the first publish.
