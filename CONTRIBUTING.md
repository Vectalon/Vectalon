# Contributing to rn-cortex

## Development

```bash
npm install
npm run build
npm test
```

## Pull Request Process

1. Fork the repo and create your branch from `main`
2. Run `npm run typecheck` to ensure types are correct
3. Run `npm test` to ensure tests pass
4. Update README if needed
5. Open a PR with a clear title and description

## Code Style

- TypeScript strict mode
- No semicolons
- Single quotes
- Functional patterns preferred
- Async/await over raw promises

## Adding a Model Provider

Create a new file in `src/model/providers/` that implements the `generate(request)` method and register it in `ModelRouter.ts`.

## Adding an SDLC Module

Create in `src/sdlc/` and export from `src/sdlc/index.ts`. Register your tool in `src/protocol/MCPServer.ts`.
