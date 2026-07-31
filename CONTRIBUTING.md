# Contributing to rn-vectalon

## Development

```bash
npm install
npm run build
npm test
npm run lint
npm run typecheck
```

## Pull Request Process

1. Fork the repo and create your branch from `main`
2. Run `npm run typecheck` to ensure types are correct
3. Run `npm run lint` to ensure style rules pass
4. Run `npm test` to ensure tests pass
5. Update README and CHANGELOG if needed
6. Open a PR with a clear title and description

## Code Style

- TypeScript strict mode
- No semicolons
- Single quotes
- Functional patterns preferred
- Async/await over raw promises

## Testing

Tests live in `__tests__/` and mirror the `src/` structure. Jest is configured
in `jest.config.js` with `ts-jest`. Filesystem-touching code should be tested
against temp directories (see `__tests__/helpers/tmp.ts`), and config tests must
point `RN_VECTALON_CONFIG_DIR` at a temp directory so they never touch real
user config.

## Adding a Model Provider

Create a new file in `src/model/providers/` that implements the `generate(request)` method and register it in `ModelRouter.ts`.

## Adding an SDLC Module

Create in `src/sdlc/` and export from `src/sdlc/index.ts`. Register your tool in `src/protocol/MCPServer.ts`.
